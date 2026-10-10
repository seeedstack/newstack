"""Orchestration boundary — the only file other features import. Ties fetch -> parse ->
upsert -> immediate embed attempt together, one ingestion_runs row per source attempt, and
source_ingestion_state bookkeeping (ARCHITECTURE §8). A FetchGuardError is a normal failed
run and is recorded; any other exception propagates uncaught, so a genuine crash leaves
next_attempt_at untouched and the source stays claimable on the next tick."""
from __future__ import annotations

from datetime import datetime, timezone

import psycopg

import config
from clustering.apply import process_article
from embed.input import build_embed_input
from embed.model import tokenize_and_decode
from fetch.guard import FetchGuardError, fetch
from fetch.rss import parse_feed
from language import decide_skip_reason, detect_language
from upsert import upsert_article

DUE_SOURCES_SQL = """
SELECT s.id, s.rss_url, s.adapter, s.language, s.feed_timezone, st.etag, st.last_modified,
       st.poll_interval_minutes, st.failure_count
FROM source_ingestion_state st JOIN sources s ON s.id = st.source_id
WHERE s.status = 'active' AND s.rss_url IS NOT NULL AND st.next_attempt_at <= now()
ORDER BY st.next_attempt_at
"""


def due_sources(conn: psycopg.Connection) -> list[tuple]:
    return conn.execute(DUE_SOURCES_SQL).fetchall()


def ingest_source(conn: psycopg.Connection, *, source_id, rss_url, adapter, source_language,
                   etag, last_modified, embed_input_cfg, clustering_cfg) -> dict:
    started_at = datetime.now(timezone.utc)
    adapter_cfg = config.load_source_adapter(adapter)
    try:
        result = fetch(rss_url, etag=etag, last_modified=last_modified)
    except FetchGuardError as e:
        _record_run(conn, source_id, started_at, "failed", None, 0, 0, 0, str(e))
        _record_failure(conn, source_id, error=str(e))
        return {"outcome": "failed", "error": str(e)}

    if result.status_code == 304:
        _record_run(conn, source_id, started_at, "not_modified", 304, 0, 0, 0, None)
        _record_success(conn, source_id, etag=etag, last_modified=last_modified, had_new_item=False)
        return {"outcome": "not_modified"}

    parsed = parse_feed(result.body, adapter_cfg)
    items_new = 0
    had_new_item = False
    for item in parsed.items:
        language = detect_language(f"{item.title} {item.excerpt}", source_language)
        skip_reason = decide_skip_reason(language, clustering_cfg["supported_languages"])
        embed_input = build_embed_input(item.title, item.excerpt, embed_input_cfg["denylist_patterns"],
                                         tokenize_and_decode, embed_input_cfg["max_tokens"])
        upserted = upsert_article(
            conn, source_id=source_id, title=item.title, url=item.url,
            canonical_url=item.canonical_url, canonicalization_version=item.canonicalization_version,
            guid=item.guid, excerpt=item.excerpt, author=item.author, image_url=item.image_url,
            language=language, section=None, published_at=item.published_at,
            content_hash=embed_input.content_hash, skip_reason=skip_reason,
        )
        if upserted.inserted:
            items_new += 1
            had_new_item = True
        needs_embed = (upserted.embedded_content_hash != upserted.content_hash and not upserted.hidden
                       and skip_reason is None and upserted.embed_attempts < 5)
        if needs_embed:
            process_article(conn, article_id=upserted.id, title=item.title, excerpt=item.excerpt,
                             denylist_patterns=embed_input_cfg["denylist_patterns"])

    _record_run(conn, source_id, started_at, "ok", result.status_code,
               parsed.items_seen, items_new, parsed.items_rejected, None)
    _record_success(conn, source_id, etag=result.headers.get("etag"),
                    last_modified=result.headers.get("last-modified"), had_new_item=had_new_item)
    return {"outcome": "ok", "items_new": items_new, "items_rejected": parsed.items_rejected}


def _record_run(conn, source_id, started_at, outcome, http_status, items_seen, items_new,
                items_rejected, error) -> None:
    with conn.transaction():
        conn.execute(
            "INSERT INTO ingestion_runs (source_id, started_at, finished_at, outcome, http_status, "
            "items_seen, items_new, items_rejected, error) VALUES "
            "(%(source_id)s, %(started_at)s, now(), %(outcome)s, %(http_status)s, %(items_seen)s, "
            "%(items_new)s, %(items_rejected)s, %(error)s)",
            {"source_id": source_id, "started_at": started_at, "outcome": outcome,
             "http_status": http_status, "items_seen": items_seen, "items_new": items_new,
             "items_rejected": items_rejected, "error": error},
        )


def _record_success(conn, source_id, *, etag, last_modified, had_new_item) -> None:
    with conn.transaction():
        conn.execute(
            "UPDATE source_ingestion_state SET failure_count = 0, status = 'healthy', "
            "last_attempted_at = now(), last_success_at = now(), last_error = NULL, "
            "etag = %(etag)s, last_modified = %(last_modified)s, "
            "last_new_item_at = CASE WHEN %(had_new_item)s THEN now() ELSE last_new_item_at END, "
            "zero_items_streak = CASE WHEN %(had_new_item)s THEN 0 ELSE zero_items_streak + 1 END, "
            "next_attempt_at = now() + (poll_interval_minutes * interval '1 minute') "
            "WHERE source_id = %(source_id)s",
            {"etag": etag, "last_modified": last_modified, "had_new_item": had_new_item, "source_id": source_id},
        )


def _record_failure(conn, source_id, *, error) -> None:
    with conn.transaction():
        conn.execute(
            "UPDATE source_ingestion_state SET failure_count = failure_count + 1, "
            "last_attempted_at = now(), last_error = %(error)s, "
            "status = CASE WHEN failure_count + 1 >= 3 THEN 'failing' ELSE 'degraded' END, "
            "next_attempt_at = now() + (LEAST(poll_interval_minutes * power(2, failure_count + 1), 1440) "
            "  * (0.9 + random() * 0.2) * interval '1 minute') "
            "WHERE source_id = %(source_id)s",
            {"error": error[:2000], "source_id": source_id},
        )
