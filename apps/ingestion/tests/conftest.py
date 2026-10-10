import psycopg
import pytest

import db


@pytest.fixture(autouse=True)
def cleanup_before_test():
    """Clean up any eligible articles from previous test runs before each test."""
    with psycopg.connect(db.DSN, autocommit=True) as conn:
        # Delete all articles that match the sweep criteria AND are not referenced by stories
        conn.execute(
            "DELETE FROM articles WHERE embedded_content_hash IS DISTINCT FROM content_hash "
            "AND embed_attempts < 5 AND skip_reason IS NULL AND hidden_at IS NULL "
            "AND id NOT IN (SELECT headline_article_id FROM stories WHERE headline_article_id IS NOT NULL)"
        )
