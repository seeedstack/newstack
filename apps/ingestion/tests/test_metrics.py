import logging
import uuid

import psycopg
import pytest

import db
import metrics

DSN = db.DSN


@pytest.fixture
def source_id():
    with psycopg.connect(DSN, autocommit=True) as conn:
        sid = conn.execute(
            "INSERT INTO sources (name, domain, country_code, language, feed_timezone, stale_after_hours) "
            "VALUES (%s, %s, 'IN', 'en', 'Asia/Kolkata', 24) RETURNING id",
            (f"Src {uuid.uuid4()}", f"{uuid.uuid4()}.example"),
        ).fetchone()[0]
    yield sid
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM ingestion_runs WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM source_ingestion_state WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM sources WHERE id = %s", (sid,))


def test_tick_summary_counts_source_health_states(source_id):
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("UPDATE source_ingestion_state SET status = 'failing' WHERE source_id = %s", (source_id,))
    with psycopg.connect(DSN) as conn:
        summary = metrics.tick_summary(conn, {"sources_processed": 1, "tick_overrun": False})
    assert summary["sources_failing"] >= 1
    assert summary["sources_processed"] == 1  # the tick_result fields pass through unchanged


def test_tick_summary_flags_quiet_source(source_id):
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute(
            "UPDATE source_ingestion_state SET last_new_item_at = now() - interval '48 hours' "
            "WHERE source_id = %s", (source_id,),
        )
    with psycopg.connect(DSN) as conn:
        summary = metrics.tick_summary(conn, {"sources_processed": 0, "tick_overrun": False})
    assert str(source_id) in summary["quiet_sources"]  # quiet_sources holds str(source_id) values


def test_log_tick_summary_warns_on_high_failure_rate(caplog):
    summary = {"sources_processed": 1, "tick_overrun": False, "sources_healthy": 0,
               "sources_degraded": 0, "sources_failing": 1, "oldest_due_source_age_seconds": 10,
               "quiet_sources": [], "source_failure_rate_24h": {"src-1": 0.5}}
    with caplog.at_level(logging.WARNING):
        metrics.log_tick_summary(summary)
    assert any("failure_rate_24h" in r.message or "0.5" in r.message for r in caplog.records)
