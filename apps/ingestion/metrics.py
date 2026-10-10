"""Per-tick structured metrics and anomaly signals (ARCHITECTURE §5 'Anomaly signals', §11
'Pipeline metrics'). One structured log line per tick at MVP; Prometheus later (dormant)."""
from __future__ import annotations

import json
import logging

import psycopg

logger = logging.getLogger("newstack.metrics")

OLDEST_DUE_SOURCE_ALERT_SECONDS = 30 * 60
FAILURE_RATE_ALERT_THRESHOLD = 0.30


def tick_summary(conn: psycopg.Connection, tick_result: dict) -> dict:
    health_counts = dict(conn.execute(
        "SELECT status, count(*) FROM source_ingestion_state GROUP BY status"
    ).fetchall())
    oldest_due_age = conn.execute(
        "SELECT extract(epoch FROM now() - min(next_attempt_at)) FROM source_ingestion_state "
        "WHERE next_attempt_at <= now()"
    ).fetchone()[0]
    quiet_sources = [str(r[0]) for r in conn.execute(
        "SELECT st.source_id FROM source_ingestion_state st JOIN sources s ON s.id = st.source_id "
        "WHERE st.last_new_item_at IS NOT NULL "
        "AND st.last_new_item_at < now() - (s.stale_after_hours || ' hours')::interval"
    ).fetchall()]
    failure_rates = {
        str(source_id): failed / total for source_id, failed, total in conn.execute(
            "SELECT source_id, count(*) FILTER (WHERE outcome = 'failed'), count(*) "
            "FROM ingestion_runs WHERE started_at >= now() - interval '24 hours' "
            "GROUP BY source_id"
        ).fetchall() if total
    }
    return {
        **tick_result,
        "sources_healthy": health_counts.get("healthy", 0),
        "sources_degraded": health_counts.get("degraded", 0),
        "sources_failing": health_counts.get("failing", 0),
        "oldest_due_source_age_seconds": oldest_due_age or 0,
        "quiet_sources": quiet_sources,
        "source_failure_rate_24h": failure_rates,
    }


def log_tick_summary(summary: dict) -> None:
    logger.info(json.dumps(summary, default=str))
    if summary["oldest_due_source_age_seconds"] > OLDEST_DUE_SOURCE_ALERT_SECONDS:
        logger.warning("oldest_due_source_age_seconds=%s exceeds 30min alert threshold",
                       summary["oldest_due_source_age_seconds"])
    for source_id, rate in summary["source_failure_rate_24h"].items():
        if rate > FAILURE_RATE_ALERT_THRESHOLD:
            logger.warning("source %s failure_rate_24h=%.2f exceeds 30%% alert threshold", source_id, rate)
