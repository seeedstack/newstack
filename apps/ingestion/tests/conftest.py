import psycopg
import pytest

import db


@pytest.fixture(autouse=True)
def cleanup_before_test():
    """Clean up fixture leftovers from previous test runs before each test."""
    with psycopg.connect(db.DSN, autocommit=True) as conn:
        # Delete all articles that match the sweep criteria AND are not referenced by stories
        conn.execute(
            "DELETE FROM articles WHERE embedded_content_hash IS DISTINCT FROM content_hash "
            "AND embed_attempts < 5 AND skip_reason IS NULL AND hidden_at IS NULL "
            "AND id NOT IN (SELECT headline_article_id FROM stories WHERE headline_article_id IS NOT NULL)"
        )
        # Fixtures create sources/articles under *.example domains (RFC 2606); these never
        # hit a real feed, so purge anything not pinned by a story (which can't be deleted).
        conn.execute(
            "DELETE FROM source_ratings WHERE source_id IN (SELECT id FROM sources WHERE domain LIKE '%.example')"
        )
        conn.execute(
            "DELETE FROM source_ingestion_state WHERE source_id IN (SELECT id FROM sources WHERE domain LIKE '%.example')"
        )
        conn.execute(
            "DELETE FROM articles WHERE source_id IN (SELECT id FROM sources WHERE domain LIKE '%.example') "
            "AND id NOT IN (SELECT headline_article_id FROM stories WHERE headline_article_id IS NOT NULL)"
        )
        conn.execute(
            "DELETE FROM sources WHERE domain LIKE '%.example' AND id NOT IN (SELECT source_id FROM articles)"
        )
