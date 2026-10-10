"""Retry sweeper (ARCHITECTURE §8). Picks up pending articles with per-article exponential
backoff (1, 2, 4, 8, 16 min, then gave up) and routes each through process_article()."""
from __future__ import annotations

import psycopg

from clustering.apply import process_article

SWEEP_SQL = """
SELECT id, content_hash, title, excerpt
FROM articles
WHERE embedded_content_hash IS DISTINCT FROM content_hash
  AND embed_attempts < 5
  AND skip_reason IS NULL
  AND hidden_at IS NULL
  AND (last_embed_attempt_at IS NULL
       OR last_embed_attempt_at < now() - make_interval(mins => power(2, embed_attempts)::int))
ORDER BY last_embed_attempt_at NULLS FIRST, effective_at DESC
LIMIT %(limit)s
"""


def sweep(conn: psycopg.Connection, denylist_patterns: list[str], limit: int = 100) -> dict:
    rows = conn.execute(SWEEP_SQL, {"limit": limit}).fetchall()
    succeeded = 0
    for article_id, _content_hash, title, excerpt in rows:
        outcome = process_article(conn, article_id=article_id, title=title, excerpt=excerpt or "",
                                   denylist_patterns=denylist_patterns)
        if outcome == "CLUSTERED":
            succeeded += 1
    return {"sweeper_picked": len(rows), "sweeper_succeeded": succeeded}
