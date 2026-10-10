"""Read-only CLI for audits (PRODUCT §9.2 Phase 1). usage: python -m cli.story_browser [--hours 24] [--limit 20]"""
from __future__ import annotations

import argparse

import psycopg

import db

STORIES_SQL = """
SELECT s.id, s.title, s.status,
       count(DISTINCT a.source_id) AS source_count,
       count(a.id) FILTER (WHERE a.hidden_at IS NOT NULL) AS hidden_count
FROM stories s
LEFT JOIN articles a ON a.story_id = s.id
WHERE s.event_last_updated_at >= now() - (%(hours)s || ' hours')::interval
GROUP BY s.id, s.title, s.status
ORDER BY s.event_last_updated_at DESC NULLS LAST
LIMIT %(limit)s
"""

CLUSTER_REPORTS_SQL = """
SELECT kind, story_id, article_id, other_story_id, reported_by, created_at
FROM cluster_reports
WHERE resolved_at IS NULL
ORDER BY created_at DESC
LIMIT %(limit)s
"""

GAVE_UP_SQL = """
SELECT count(*) FROM articles
WHERE embedded_content_hash IS DISTINCT FROM content_hash AND embed_attempts >= 5
"""


def print_stories(conn: psycopg.Connection, hours: int, limit: int) -> None:
    rows = conn.execute(STORIES_SQL, {"hours": hours, "limit": limit}).fetchall()
    print(f"\n{'STORY':<38} {'STATUS':<11} {'SOURCES':>7} {'HIDDEN':>6}  TITLE")
    for story_id, title, status, source_count, hidden_count in rows:
        print(f"{story_id!s:<38} {status:<11} {source_count:>7} {hidden_count:>6}  {title[:60]}")


def print_open_cluster_reports(conn: psycopg.Connection, limit: int) -> None:
    rows = conn.execute(CLUSTER_REPORTS_SQL, {"limit": limit}).fetchall()
    print(f"\n{len(rows)} open cluster report(s):")
    for kind, story_id, article_id, other_story_id, reported_by, created_at in rows:
        print(f"  [{kind}] story={story_id} article={article_id} other={other_story_id} "
              f"by={reported_by} at={created_at}")


def print_gave_up_count(conn: psycopg.Connection) -> None:
    count = conn.execute(GAVE_UP_SQL).fetchone()[0]
    print(f"\n{count} article(s) gave up after 5 embed attempts.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only story browser for audits")
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    with psycopg.connect(db.DSN, autocommit=True) as conn:
        print_stories(conn, args.hours, args.limit)
        print_open_cluster_reports(conn, args.limit)
        print_gave_up_count(conn)


if __name__ == "__main__":
    main()
