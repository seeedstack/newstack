import uuid

import psycopg
import pytest

import db
from upsert import upsert_article

DSN = db.DSN


@pytest.fixture
def source_id():
    with psycopg.connect(DSN, autocommit=True) as conn:
        row = conn.execute(
            "INSERT INTO sources (name, domain, country_code, language, feed_timezone) "
            "VALUES (%s, %s, 'IN', 'en', 'Asia/Kolkata') RETURNING id",
            (f"Test Source {uuid.uuid4()}", f"{uuid.uuid4()}.example"),
        ).fetchone()
        sid = row[0]
    yield sid
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM articles WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM source_ingestion_state WHERE source_id = %s", (sid,))
        conn.execute("DELETE FROM sources WHERE id = %s", (sid,))


def _article_count(source_id) -> int:
    with psycopg.connect(DSN, autocommit=True) as conn:
        return conn.execute("SELECT count(*) FROM articles WHERE source_id = %s", (source_id,)).fetchone()[0]


def test_upsert_creates_new_article(source_id):
    with psycopg.connect(DSN) as conn:
        result = upsert_article(
            conn, source_id=source_id, title="Hello", url="https://x.com/a", canonical_url="x.com/a",
            canonicalization_version="c1", guid=None, excerpt="", author=None, image_url=None,
            language="en", section=None, published_at=None, content_hash="e1:aaa", skip_reason=None,
        )
    assert result.inserted is True
    assert result.story_id is None
    assert _article_count(source_id) == 1


def test_upsert_same_canonical_url_is_update_not_duplicate(source_id):
    """Review Focus: two upserts with the same canonical key must result in exactly one row."""
    with psycopg.connect(DSN) as conn:
        upsert_article(
            conn, source_id=source_id, title="First Title", url="https://x.com/a", canonical_url="x.com/a",
            canonicalization_version="c1", guid=None, excerpt="", author=None, image_url=None,
            language="en", section=None, published_at=None, content_hash="e1:aaa", skip_reason=None,
        )
        second = upsert_article(
            conn, source_id=source_id, title="Updated Title", url="https://x.com/a", canonical_url="x.com/a",
            canonicalization_version="c1", guid=None, excerpt="", author=None, image_url=None,
            language="en", section=None, published_at=None, content_hash="e1:aaa", skip_reason=None,
        )
    assert second.inserted is False
    assert _article_count(source_id) == 1
    with psycopg.connect(DSN, autocommit=True) as conn:
        title = conn.execute("SELECT title FROM articles WHERE id = %s", (second.id,)).fetchone()[0]
    assert title == "Updated Title"


def test_content_change_resets_embed_attempts(source_id):
    with psycopg.connect(DSN) as conn:
        first = upsert_article(
            conn, source_id=source_id, title="T", url="https://x.com/b", canonical_url="x.com/b",
            canonicalization_version="c1", guid=None, excerpt="", author=None, image_url=None,
            language="en", section=None, published_at=None, content_hash="e1:bbb", skip_reason=None,
        )
        with conn.cursor() as cur:
            cur.execute("UPDATE articles SET embed_attempts = 3 WHERE id = %s", (first.id,))
        conn.commit()
        changed = upsert_article(
            conn, source_id=source_id, title="T", url="https://x.com/b", canonical_url="x.com/b",
            canonicalization_version="c1", guid=None, excerpt="", author=None, image_url=None,
            language="en", section=None, published_at=None, content_hash="e1:ccc", skip_reason=None,
        )
    assert changed.embed_attempts == 0


def test_unchanged_content_keeps_embed_attempts(source_id):
    with psycopg.connect(DSN) as conn:
        first = upsert_article(
            conn, source_id=source_id, title="T", url="https://x.com/c", canonical_url="x.com/c",
            canonicalization_version="c1", guid=None, excerpt="", author=None, image_url=None,
            language="en", section=None, published_at=None, content_hash="e1:ddd", skip_reason=None,
        )
        with conn.cursor() as cur:
            cur.execute("UPDATE articles SET embed_attempts = 2 WHERE id = %s", (first.id,))
        conn.commit()
        unchanged = upsert_article(
            conn, source_id=source_id, title="T (metadata edit)", url="https://x.com/c", canonical_url="x.com/c",
            canonicalization_version="c1", guid=None, excerpt="", author=None, image_url=None,
            language="en", section=None, published_at=None, content_hash="e1:ddd", skip_reason=None,
        )
    assert unchanged.embed_attempts == 2
