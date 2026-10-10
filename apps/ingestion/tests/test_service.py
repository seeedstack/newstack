import uuid

import psycopg
import pytest

import db
import service

DSN = db.DSN


@pytest.fixture
def source_row():
    with psycopg.connect(DSN, autocommit=True) as conn:
        sid = conn.execute(
            "INSERT INTO sources (name, domain, country_code, language, feed_timezone, rss_url) "
            "VALUES (%s, %s, 'IN', 'en', 'Asia/Kolkata', 'http://safe.example/feed.xml') RETURNING id",
            (f"Src {uuid.uuid4()}", f"{uuid.uuid4()}.example"),
        ).fetchone()[0]
    yield sid
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM articles WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM ingestion_runs WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM source_ingestion_state WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM sources WHERE id = %s", (sid,))


EMBED_CFG = {"denylist_patterns": [], "max_tokens": 256}
CLUSTERING_CFG = {"supported_languages": ["en"]}


def test_fetch_guard_error_is_recorded_as_failed_run(source_row, monkeypatch):
    import fetch.guard as fetch_guard

    def raising_fetch(*a, **kw):
        raise fetch_guard.FetchGuardError("blocked address")

    monkeypatch.setattr(service, "fetch", raising_fetch)
    with psycopg.connect(DSN) as conn:
        result = service.ingest_source(
            conn, source_id=source_row, rss_url="http://blocked.example/feed.xml", adapter="generic",
            source_language="en", etag=None, last_modified=None,
            embed_input_cfg=EMBED_CFG, clustering_cfg=CLUSTERING_CFG,
        )
    assert result["outcome"] == "failed"
    with psycopg.connect(DSN, autocommit=True) as conn:
        outcome, error = conn.execute(
            "SELECT outcome, error FROM ingestion_runs WHERE source_id = %s", (source_row,)
        ).fetchone()
        failure_count, status = conn.execute(
            "SELECT failure_count, status FROM source_ingestion_state WHERE source_id = %s", (source_row,)
        ).fetchone()
    assert outcome == "failed" and "blocked address" in error
    assert failure_count == 1 and status == "degraded"


def test_unexpected_crash_leaves_source_claimable_next_tick(source_row, monkeypatch):
    """Review Focus: a crash mid-ingest must not advance next_attempt_at — the source stays
    due and is re-claimed on the next tick, never silently marked processed."""
    with psycopg.connect(DSN, autocommit=True) as conn:
        before = conn.execute(
            "SELECT next_attempt_at FROM source_ingestion_state WHERE source_id = %s", (source_row,)
        ).fetchone()[0]

    def raising_fetch(*a, **kw):
        raise RuntimeError("process crashed mid-fetch")  # not a FetchGuardError — not caught

    monkeypatch.setattr(service, "fetch", raising_fetch)
    with psycopg.connect(DSN) as conn:
        with pytest.raises(RuntimeError):
            service.ingest_source(
                conn, source_id=source_row, rss_url="http://safe.example/feed.xml", adapter="generic",
                source_language="en", etag=None, last_modified=None,
                embed_input_cfg=EMBED_CFG, clustering_cfg=CLUSTERING_CFG,
            )
    with psycopg.connect(DSN, autocommit=True) as conn:
        after = conn.execute(
            "SELECT next_attempt_at FROM source_ingestion_state WHERE source_id = %s", (source_row,)
        ).fetchone()[0]
    assert after == before  # untouched: still due, will be picked up again


def test_failure_backoff_includes_jitter(source_row, monkeypatch):
    """Verify exponential backoff includes ±10% jitter per ARCHITECTURE.md §1187."""
    from datetime import timedelta
    import fetch.guard as fetch_guard

    def raising_fetch(*a, **kw):
        raise fetch_guard.FetchGuardError("error for jitter test")

    monkeypatch.setattr(service, "fetch", raising_fetch)

    with psycopg.connect(DSN, autocommit=True) as conn:
        before_trigger = conn.execute("SELECT now()").fetchone()[0]
    with psycopg.connect(DSN) as conn:
        service.ingest_source(
            conn, source_id=source_row, rss_url="http://example.com/feed.xml", adapter="generic",
            source_language="en", etag=None, last_modified=None,
            embed_input_cfg=EMBED_CFG, clustering_cfg=CLUSTERING_CFG,
        )
    with psycopg.connect(DSN, autocommit=True) as conn:
        after_trigger = conn.execute("SELECT now()").fetchone()[0]

    with psycopg.connect(DSN, autocommit=True) as conn:
        poll_interval_minutes, failure_count, next_attempt_at = conn.execute(
            "SELECT poll_interval_minutes, failure_count, next_attempt_at "
            "FROM source_ingestion_state WHERE source_id = %s", (source_row,)
        ).fetchone()

    # failure_count=1 after first failure, so power(2, 1)=2
    expected_minutes = poll_interval_minutes * (2 ** failure_count)
    expected_base = before_trigger + timedelta(minutes=expected_minutes * 0.9)
    expected_top = after_trigger + timedelta(minutes=expected_minutes * 1.1)

    assert expected_base <= next_attempt_at <= expected_top, \
        f"next_attempt_at {next_attempt_at} not in [{expected_base}, {expected_top}] (jitter bounds)"
