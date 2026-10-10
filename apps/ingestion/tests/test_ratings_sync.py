import uuid

import psycopg
import pytest

import db
from jobs import ratings_sync

DSN = db.DSN

RATING = {
    "source": None,  # filled per-test with a unique domain
    "spectrum": "IN",
    "method": "manual-curation",
    "method_version": "rubric-v1",
    "bias": "center-left",
    "factuality": "high",
    "confidence": "medium",
    "raters": ["curator-a", "curator-b"],
    "rubric_scores": {"curator-a": {"D1": -1}, "curator-b": {"D1": -1}},
    "evidence": [{"url": "https://a"}, {"url": "https://b"}, {"url": "https://c"}],
    "review_due": "2027-04-01",
    "notes": "test",
}


@pytest.fixture
def domain():
    d = f"{uuid.uuid4()}.example"
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO sources (name, domain, country_code, language, feed_timezone) "
            "VALUES ('Test', %s, 'IN', 'en', 'Asia/Kolkata')", (d,),
        )
    yield d
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("DELETE FROM source_ratings WHERE source_id = "
                     "(SELECT id FROM sources WHERE domain = %s)", (d,))
        conn.execute("DELETE FROM source_ingestion_state WHERE source_id = "
                     "(SELECT id FROM sources WHERE domain = %s)", (d,))
        conn.execute("DELETE FROM sources WHERE domain = %s", (d,))


def test_sync_one_creates_first_rating(domain):
    rating = {**RATING, "source": domain}
    with psycopg.connect(DSN) as conn:
        new_id = ratings_sync.sync_one(conn, rating, source_ref="abc123")
    with psycopg.connect(DSN, autocommit=True) as conn:
        row = conn.execute(
            "SELECT bias_rating, confidence, source_ref, superseded_at FROM source_ratings WHERE id = %s",
            (new_id,),
        ).fetchone()
    assert row == ("center-left", "medium", "abc123", None)


def test_sync_one_supersedes_previous_rating(domain):
    rating = {**RATING, "source": domain}
    with psycopg.connect(DSN) as conn:
        first_id = ratings_sync.sync_one(conn, rating, source_ref="rev1")
        second_id = ratings_sync.sync_one(conn, {**rating, "bias": "center"}, source_ref="rev2")
    with psycopg.connect(DSN, autocommit=True) as conn:
        first_superseded = conn.execute(
            "SELECT superseded_at IS NOT NULL, supersedes FROM source_ratings WHERE id = %s", (first_id,)
        ).fetchone()
    assert first_superseded == (True, None)
    assert second_id != first_id


def test_sync_one_raises_for_unknown_domain():
    with psycopg.connect(DSN) as conn:
        with pytest.raises(ValueError, match="no source"):
            ratings_sync.sync_one(conn, {**RATING, "source": "nonexistent.example"}, source_ref="x")


def test_sync_all_reads_yaml_files_from_a_directory(domain, tmp_path):
    import yaml
    in_dir = tmp_path / "IN"
    in_dir.mkdir()
    (in_dir / f"{domain}.yaml").write_text(yaml.safe_dump({**RATING, "source": domain}))
    with psycopg.connect(DSN) as conn:
        result = ratings_sync.sync_all(conn, source_ref="rev1", ratings_root=tmp_path)
    assert result == {"synced": 1, "errors": []}
