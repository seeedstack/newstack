import threading
import time
import uuid

import psycopg
import pytest

import db
from workers import scheduler

DSN = db.DSN


def test_leader_lock_blocks_a_second_holder():
    first = db.leader_connection(DSN)
    got_first = first.execute("SELECT pg_try_advisory_lock(%s)", (scheduler.LEADER_LOCK_ID,)).fetchone()[0]
    assert got_first is True
    second = db.leader_connection(DSN)
    got_second = second.execute("SELECT pg_try_advisory_lock(%s)", (scheduler.LEADER_LOCK_ID,)).fetchone()[0]
    assert got_second is False
    first.close()  # releases the lock when the session ends
    got_second_retry = second.execute("SELECT pg_try_advisory_lock(%s)", (scheduler.LEADER_LOCK_ID,)).fetchone()[0]
    assert got_second_retry is True
    second.close()


def test_run_tick_respects_budget_and_sweeps_with_remainder(monkeypatch):
    calls = []
    due_rows = [
        ("s1", "http://safe1.example/feed.xml", "generic", "en", "UTC", None, None, 15, 0),
        ("s2", "http://safe2.example/feed.xml", "generic", "en", "UTC", None, None, 15, 0),
    ]
    monkeypatch.setattr(scheduler.service, "due_sources", lambda conn: due_rows)
    monkeypatch.setattr(scheduler.service, "ingest_source", lambda conn, **kw: calls.append(kw) or {"outcome": "ok"})
    monkeypatch.setattr(scheduler.sweeper, "sweep", lambda conn, patterns, limit=100: {"sweeper_picked": 0, "sweeper_succeeded": 0})
    with db.get_pool().connection():
        pass  # ensure pool is warm
    result = scheduler.run_tick(db.get_pool(), {"supported_languages": ["en"]}, {"denylist_patterns": [], "max_tokens": 256},
                                 budget_seconds=50)
    assert result["sources_processed"] == 2
    assert result["tick_overrun"] is False


def test_run_tick_continues_on_per_source_crash(monkeypatch):
    """Verify that if one source crashes, remaining sources are still processed and sweep runs."""
    calls = []
    due_rows = [
        ("s1", "http://crashing.example/feed.xml", "generic", "en", "UTC", None, None, 15, 0),
        ("s2", "http://safe.example/feed.xml", "generic", "en", "UTC", None, None, 15, 0),
    ]

    def ingest_with_crash(conn, **kw):
        calls.append(kw["source_id"])
        if kw["source_id"] == "s1":
            raise RuntimeError("source 1 crashed")
        return {"outcome": "ok"}

    sweep_called = []

    def mock_sweep(conn, patterns, limit=100):
        sweep_called.append(True)
        return {"sweeper_picked": 0, "sweeper_succeeded": 0}

    monkeypatch.setattr(scheduler.service, "due_sources", lambda conn: due_rows)
    monkeypatch.setattr(scheduler.service, "ingest_source", ingest_with_crash)
    monkeypatch.setattr(scheduler.sweeper, "sweep", mock_sweep)
    with db.get_pool().connection():
        pass  # ensure pool is warm
    result = scheduler.run_tick(db.get_pool(), {"supported_languages": ["en"]}, {"denylist_patterns": [], "max_tokens": 256},
                                 budget_seconds=50)
    assert calls == ["s1", "s2"], f"Both sources should be processed despite s1 crashing, got {calls}"
    assert result["sources_processed"] == 1, "Only s2 should count as processed (s1 crashed)"
    assert sweep_called, "Sweep should have been called despite s1 crashing"
