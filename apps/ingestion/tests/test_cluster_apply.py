import uuid
from datetime import datetime, timezone

import psycopg
import pytest

import db
from clustering.apply import StaleWriteError, apply_embed_result, process_article
from clustering.decide import Config
from embed.model import EmbeddingFailedError

DSN = db.DSN


def _vec(nonzero: list[float]) -> list[float]:
    v = [0.0] * 384
    for i, x in enumerate(nonzero):
        v[i] = x
    return v


@pytest.fixture
def source_id():
    with psycopg.connect(DSN, autocommit=True) as conn:
        sid = conn.execute(
            "INSERT INTO sources (name, domain, country_code, language, feed_timezone) "
            "VALUES (%s, %s, 'IN', 'en', 'Asia/Kolkata') RETURNING id",
            (f"Src {uuid.uuid4()}", f"{uuid.uuid4()}.example"),
        ).fetchone()[0]
    yield sid
    with psycopg.connect(DSN, autocommit=True) as conn:
        # Hide stories and articles so they won't be candidates/interfere with future tests
        conn.execute("UPDATE stories SET hidden_at = now() WHERE headline_article_id IN "
                     "(SELECT id FROM articles WHERE source_id = %s)", (sid,))
        conn.execute("UPDATE articles SET hidden_at = now(), hidden_reason = 'duplicate' WHERE source_id = %s", (sid,))


@pytest.fixture(autouse=True)
def clustering_state_seeded():
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute(
            "INSERT INTO clustering_state (singleton, active_cluster_version, embedding_model, embed_input_version) "
            "VALUES (true, 'v1', 'test-model@rev', 'e1') ON CONFLICT (singleton) DO NOTHING"
        )


def _insert_pending_article(source_id: str, canonical_url: str) -> str:
    with psycopg.connect(DSN, autocommit=True) as conn:
        from pgvector.psycopg import register_vector
        register_vector(conn)
        return conn.execute(
            "INSERT INTO articles (source_id, title, url, canonical_url, canonicalization_version, "
            "content_hash, effective_at) VALUES (%s, 't', %s, %s, 'c1', 'e1:seed', now()) RETURNING id",
            (source_id, f"https://{canonical_url}", canonical_url),
        ).fetchone()[0]


def test_create_new_story_when_no_candidates(source_id):
    article_id = _insert_pending_article(source_id, "x.com/create-1")
    with psycopg.connect(DSN) as conn:
        from pgvector.psycopg import register_vector
        register_vector(conn)
        outcome = apply_embed_result(
            conn, article_id=article_id, h="e1:seed", vector=_vec([1.0]),
            embedding_model_id="test-model@rev", title="New Story", excerpt="body",
        )
    assert outcome.action == "CREATE"
    with psycopg.connect(DSN, autocommit=True) as conn:
        story_status = conn.execute("SELECT status FROM stories WHERE id = %s", (outcome.story_id,)).fetchone()[0]
    assert story_status == "active"


def test_assign_to_candidate_above_threshold(source_id):
    with psycopg.connect(DSN, autocommit=True) as conn:
        from pgvector.psycopg import register_vector
        register_vector(conn)
        headline_id = _insert_pending_article(source_id, "x.com/headline-2")
        story_id = conn.execute(
            "INSERT INTO stories (title, summary, headline_article_id, representative_embedding, "
            "representative_embedding_model, cluster_version, status, first_seen_at, "
            "event_last_updated_at, last_coverage_at) "
            "VALUES ('S', 's', %s, %s, 'test-model@rev', 'v1', 'active', now(), now(), now()) RETURNING id",
            (headline_id, _vec([1.0])),
        ).fetchone()[0]
        conn.execute("UPDATE articles SET story_id=%s, cluster_version='v1', embedding=%s, "
                     "embedding_model='test-model@rev', embedded_content_hash='e1:seed' WHERE id=%s",
                     (story_id, _vec([1.0]), headline_id))

    article_id = _insert_pending_article(source_id, "x.com/assign-2")
    with psycopg.connect(DSN) as conn:
        from pgvector.psycopg import register_vector
        register_vector(conn)
        outcome = apply_embed_result(
            conn, article_id=article_id, h="e1:seed", vector=_vec([0.95, 0.312]),
            embedding_model_id="test-model@rev", title="Similar", excerpt="body",
        )
    assert outcome.action == "ASSIGN"
    assert outcome.story_id == str(story_id)


def test_move_tombstones_emptied_old_story(source_id):
    with psycopg.connect(DSN, autocommit=True) as conn:
        from pgvector.psycopg import register_vector
        register_vector(conn)
        # Old story: two members — the headline article and a moving article.
        old_headline = _insert_pending_article(source_id, "x.com/old-headline-3")
        old_story_id = conn.execute(
            "INSERT INTO stories (title, summary, headline_article_id, representative_embedding, "
            "representative_embedding_model, cluster_version, status, first_seen_at, "
            "event_last_updated_at, last_coverage_at) "
            "VALUES ('Old', 's', %s, %s, 'test-model@rev', 'v1', 'active', now(), now(), now()) RETURNING id",
            (old_headline, _vec([0.0, 1.0])),
        ).fetchone()[0]
        conn.execute("UPDATE articles SET story_id=%s, cluster_version='v1', embedding=%s, "
                     "embedding_model='test-model@rev', embedded_content_hash='e1:seed' WHERE id=%s",
                     (old_story_id, _vec([0.0, 1.0]), old_headline))
        # New story: strongly matches the re-embedded article's new vector.
        new_headline = _insert_pending_article(source_id, "x.com/new-headline-3")
        new_story_id = conn.execute(
            "INSERT INTO stories (title, summary, headline_article_id, representative_embedding, "
            "representative_embedding_model, cluster_version, status, first_seen_at, "
            "event_last_updated_at, last_coverage_at) "
            "VALUES ('New', 's', %s, %s, 'test-model@rev', 'v1', 'active', now(), now(), now()) RETURNING id",
            (new_headline, _vec([1.0])),
        ).fetchone()[0]
        conn.execute("UPDATE articles SET story_id=%s, cluster_version='v1', embedding=%s, "
                     "embedding_model='test-model@rev', embedded_content_hash='e1:seed' WHERE id=%s",
                     (new_story_id, _vec([1.0]), new_headline))
        # Moving article: second member of old story.
        moving_id = _insert_pending_article(source_id, "x.com/moving-3")
        conn.execute("UPDATE articles SET story_id=%s, cluster_version='v1', embedding=%s, "
                     "embedding_model='test-model@rev', embedded_content_hash='e1:seed' WHERE id=%s",
                     (old_story_id, _vec([0.0, 0.95]), moving_id))

    # Part 1: move moving_id to new_story; old_story should NOT be tombstoned yet (old_headline still a member).
    with psycopg.connect(DSN) as conn:
        from pgvector.psycopg import register_vector
        register_vector(conn)
        outcome = apply_embed_result(
            conn, article_id=moving_id, h="e1:seed", vector=_vec([1.0]),
            embedding_model_id="test-model@rev", title="Moved", excerpt="body",
        )
    assert outcome.action == "MOVE"
    assert outcome.story_id == str(new_story_id)
    with psycopg.connect(DSN, autocommit=True) as conn:
        old_status = conn.execute("SELECT status FROM stories WHERE id = %s", (old_story_id,)).fetchone()[0]
    assert old_status == "active"  # NOT tombstoned: old_headline is still a member

    # Part 2: now move old_headline to new_story as well; old_story should NOW be tombstoned (all members gone).
    with psycopg.connect(DSN) as conn:
        from pgvector.psycopg import register_vector
        register_vector(conn)
        outcome = apply_embed_result(
            conn, article_id=old_headline, h="e1:seed", vector=_vec([1.0]),
            embedding_model_id="test-model@rev", title="Moved", excerpt="body",
        )
    assert outcome.action == "MOVE"
    assert outcome.story_id == str(new_story_id)
    with psycopg.connect(DSN, autocommit=True) as conn:
        old_status = conn.execute("SELECT status, merged_into FROM stories WHERE id = %s", (old_story_id,)).fetchone()
    assert old_status == ("tombstoned", new_story_id)  # NOW tombstoned: all members gone


def test_stale_write_rejected_when_content_hash_changed(source_id):
    """Review Focus: a concurrent content edit between EMBED's read and T3's commit must
    reject the write, never silently commit a vector for stale content (I5)."""
    article_id = _insert_pending_article(source_id, "x.com/stale-4")
    with psycopg.connect(DSN, autocommit=True) as conn:
        conn.execute("UPDATE articles SET content_hash = 'e1:changed' WHERE id = %s", (article_id,))
    with psycopg.connect(DSN) as conn:
        from pgvector.psycopg import register_vector
        register_vector(conn)
        with pytest.raises(StaleWriteError):
            apply_embed_result(
                conn, article_id=article_id, h="e1:seed", vector=_vec([1.0]),
                embedding_model_id="test-model@rev", title="T", excerpt="e",
            )
    with psycopg.connect(DSN, autocommit=True) as conn:
        story_id = conn.execute("SELECT story_id FROM articles WHERE id = %s", (article_id,)).fetchone()[0]
    assert story_id is None  # the article was never clustered from the stale vector


def test_process_article_routes_embedding_failure_to_pending(source_id, monkeypatch):
    """Review Focus: a non-finite/zero-norm vector is a failure, never written as data."""
    import embed.model as embed_model
    # Stub out tokenize_and_decode to avoid loading the real ML model
    monkeypatch.setattr(embed_model, "tokenize_and_decode", lambda text, max_tokens=256: text)
    # Stub out embed to simulate failure
    monkeypatch.setattr(embed_model, "embed", lambda text, model=None: (_ for _ in ()).throw(
        EmbeddingFailedError("zero-norm vector")))
    article_id = _insert_pending_article(source_id, "x.com/fail-5")
    with psycopg.connect(DSN) as conn:
        outcome = process_article(conn, article_id=article_id, title="T", excerpt="e", denylist_patterns=[])
    assert outcome == "PENDING"
    with psycopg.connect(DSN, autocommit=True) as conn:
        row = conn.execute(
            "SELECT embed_attempts, story_id, embedding FROM articles WHERE id = %s", (article_id,)
        ).fetchone()
    assert row == (1, None, None)
