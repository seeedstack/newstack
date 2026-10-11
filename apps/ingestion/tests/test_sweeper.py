import uuid

import psycopg
import pytest

import db
import sweeper

DSN = db.DSN


@pytest.fixture
def source_id():
    with psycopg.connect(DSN, autocommit=True) as conn:
        sid = conn.execute(
            "INSERT INTO sources (name, domain, country_code, language, feed_timezone) "
            "VALUES (%s, %s, 'IN', 'en', 'Asia/Kolkata') RETURNING id",
            (f"Src {uuid.uuid4()}", f"{uuid.uuid4()}.example"),
        ).fetchone()[0]
    yield sid
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM articles WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM source_ingestion_state WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM sources WHERE id = %s", (sid,))


def _pending_article(source_id, canonical_url, embed_attempts=0, last_attempt_minutes_ago=None):
    with psycopg.connect(DSN, autocommit=True) as conn:
        article_id = conn.execute(
            "INSERT INTO articles (source_id, title, url, canonical_url, canonicalization_version, "
            "content_hash, effective_at, embed_attempts) "
            "VALUES (%s, 't', %s, %s, 'c1', 'e1:x', now(), %s) RETURNING id",
            (source_id, f"https://{canonical_url}", canonical_url, embed_attempts),
        ).fetchone()[0]
        if last_attempt_minutes_ago is not None:
            conn.execute(
                "UPDATE articles SET last_embed_attempt_at = now() - make_interval(mins => %s) WHERE id = %s",
                (last_attempt_minutes_ago, article_id),
            )
    return article_id


def test_sweep_picks_never_attempted_article(source_id, monkeypatch):
    eligible = _pending_article(source_id, "x.com/a")
    calls = []
    monkeypatch.setattr(sweeper, "process_article", lambda conn, **kw: calls.append(kw["article_id"]) or "CLUSTERED")
    with psycopg.connect(DSN) as conn:
        stats = sweeper.sweep(conn, denylist_patterns=[])
    # sweep() scans the whole table, not just this fixture's source — a shared dev DB can
    # carry other eligible rows (e.g. other suites' fixtures), so check membership, not
    # exact equality. stats totals legitimately include whatever else was eligible.
    assert eligible in calls
    assert stats["sweeper_picked"] == len(calls)
    assert stats["sweeper_succeeded"] == len(calls)


def test_sweep_skips_article_still_in_backoff_window(source_id, monkeypatch):
    pending = _pending_article(source_id, "x.com/b", embed_attempts=1, last_attempt_minutes_ago=1)  # 2^1=2min, 1<2
    calls = []
    monkeypatch.setattr(sweeper, "process_article", lambda conn, **kw: calls.append(kw["article_id"]) or "CLUSTERED")
    with psycopg.connect(DSN) as conn:
        sweeper.sweep(conn, denylist_patterns=[])
    assert pending not in calls


def test_sweep_skips_gave_up_article(source_id, monkeypatch):
    gave_up = _pending_article(source_id, "x.com/c", embed_attempts=5)  # max_embed_attempts reached
    calls = []
    monkeypatch.setattr(sweeper, "process_article", lambda conn, **kw: calls.append(kw["article_id"]) or "CLUSTERED")
    with psycopg.connect(DSN) as conn:
        sweeper.sweep(conn, denylist_patterns=[])
    assert gave_up not in calls
