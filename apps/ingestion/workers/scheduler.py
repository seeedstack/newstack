"""Worker entrypoint: acquires the leader lock, then runs one APScheduler job every 60s
with a 50s time budget (ARCHITECTURE §8). No Celery, no multi-worker lock at MVP — this
process is the only writer, which is what makes assign-or-create races impossible."""
from __future__ import annotations

import logging
import os
import time

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

import config
import db
import metrics
import service
import sweeper
from jobs import baseline, maintenance, ratings_sync

logger = logging.getLogger("newstack.worker")
TICK_BUDGET_SECONDS = 50
LEADER_LOCK_ID = 7210000


def acquire_leader_lock(dsn: str):
    conn = db.leader_connection(dsn)
    while True:
        got = conn.execute("SELECT pg_try_advisory_lock(%s)", (LEADER_LOCK_ID,)).fetchone()[0]
        if got:
            return conn
        logger.info("leader lock held by another worker; retrying in 10s")
        time.sleep(10)


def run_tick(pool, clustering_cfg, embed_input_cfg, budget_seconds: int = TICK_BUDGET_SECONDS) -> dict:
    deadline = time.monotonic() + budget_seconds
    sources_processed = 0
    tick_overrun = False
    with pool.connection() as conn:
        for row in service.due_sources(conn):
            if time.monotonic() >= deadline:
                tick_overrun = True
                break
            source_id, rss_url, adapter, source_language, _feed_tz, etag, last_modified, _poll, _failures = row
            try:
                service.ingest_source(conn, source_id=source_id, rss_url=rss_url, adapter=adapter,
                                      source_language=source_language, etag=etag, last_modified=last_modified,
                                      embed_input_cfg=embed_input_cfg, clustering_cfg=clustering_cfg)
            except Exception:
                logger.exception("ingest_source crashed for source_id=%s", source_id)
                continue
            sources_processed += 1
        remaining = deadline - time.monotonic()
        sweep_stats = (sweeper.sweep(conn, embed_input_cfg["denylist_patterns"], limit=100)
                       if remaining > 0 else {"sweeper_picked": 0, "sweeper_succeeded": 0})
    result = {"sources_processed": sources_processed, "tick_overrun": tick_overrun, **sweep_stats}
    with pool.connection() as conn:
        summary = metrics.tick_summary(conn, result)
    metrics.log_tick_summary(summary)
    return summary


def _run_maintenance_job(pool) -> None:
    with pool.connection() as conn:
        maintenance.run(conn)


def _run_baseline_job(pool) -> None:
    with pool.connection() as conn:
        baseline.run(conn)


def _run_ratings_sync_job(pool) -> None:
    source_ref = os.environ.get("RATINGS_SOURCE_REF", "unknown")
    with pool.connection() as conn:
        ratings_sync.sync_all(conn, source_ref=source_ref)


def build_scheduler(pool, clustering_cfg, embed_input_cfg) -> BlockingScheduler:
    sched = BlockingScheduler()
    sched.add_job(run_tick, "interval", seconds=60, max_instances=1, coalesce=True,
                  args=[pool, clustering_cfg, embed_input_cfg])
    sched.add_job(_run_maintenance_job, CronTrigger(hour=3, minute=30, timezone="Asia/Kolkata"), args=[pool])
    sched.add_job(_run_baseline_job, CronTrigger(hour=3, minute=45, timezone="Asia/Kolkata"), args=[pool])
    sched.add_job(_run_ratings_sync_job, CronTrigger(hour=4, minute=0, timezone="Asia/Kolkata"), args=[pool])
    return sched


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    leader_conn = acquire_leader_lock(db.DSN)
    logger.info("acquired leader lock %s", LEADER_LOCK_ID)
    pool = db.get_pool()
    clustering_cfg = config.load_clustering_config()
    embed_input_cfg = config.load_embed_input_config()
    try:
        build_scheduler(pool, clustering_cfg, embed_input_cfg).start()
    finally:
        leader_conn.close()


if __name__ == "__main__":
    main()
