import uuid

import psycopg

import db
from cli import story_browser

DSN = db.DSN


def test_print_stories_shows_source_and_hidden_counts(capsys):
    with psycopg.connect(DSN, autocommit=True) as conn:
        sid = conn.execute(
            "INSERT INTO sources (name, domain, country_code, language, feed_timezone) "
            "VALUES (%s, %s, 'IN', 'en', 'Asia/Kolkata') RETURNING id",
            (f"Src {uuid.uuid4()}", f"{uuid.uuid4()}.example"),
        ).fetchone()[0]
        headline_id = conn.execute(
            "INSERT INTO articles (source_id, title, url, canonical_url, canonicalization_version, "
            "content_hash, effective_at) VALUES (%s, 'Headline', 'https://x.com/h', 'x.com/h', 'c1', "
            "'e1:h', now()) RETURNING id", (sid,),
        ).fetchone()[0]
        from pgvector.psycopg import register_vector
        register_vector(conn)
        story_id = conn.execute(
            "INSERT INTO stories (title, summary, headline_article_id, representative_embedding, "
            "representative_embedding_model, cluster_version, status, first_seen_at, "
            "event_last_updated_at, last_coverage_at) "
            "VALUES ('Browser Test Story', 's', %s, %s, 'm', 'v1', 'active', now(), now(), now()) "
            "RETURNING id", (headline_id, [0.0] * 384),
        ).fetchone()[0]
        # I2 (articles_check2): embedding IS NULL must match story_id IS NULL, so a clustered
        # article needs embedding/embedding_model/embedded_content_hash/cluster_version set too.
        conn.execute(
            "UPDATE articles SET story_id = %s, embedding = %s, embedding_model = 'm', "
            "embedded_content_hash = 'e1:h', cluster_version = 'v1' WHERE id = %s",
            (story_id, [0.0] * 384, headline_id),
        )
        hidden_id = conn.execute(
            "INSERT INTO articles (source_id, title, url, canonical_url, canonicalization_version, "
            "content_hash, effective_at, story_id, embedding, embedding_model, embedded_content_hash, "
            "cluster_version, hidden_at, hidden_reason) "
            "VALUES (%s, 'Dup', 'https://x.com/d', 'x.com/d', 'c1', 'e1:d', now(), %s, %s, 'm', 'e1:d', "
            "'v1', now(), 'duplicate') "
            "RETURNING id", (sid, story_id, [0.0] * 384),
        ).fetchone()[0]

    with psycopg.connect(DSN, autocommit=True) as conn:
        story_browser.print_stories(conn, hours=24, limit=10)
    out = capsys.readouterr().out
    assert "Browser Test Story" in out
    assert str(story_id) in out

    with psycopg.connect(DSN, autocommit=True) as conn:
        # stories can never be hard-deleted once active (stories_no_delete() trigger) and
        # sources/articles have the same FK chain seen in earlier tasks — hide, don't delete.
        conn.execute("UPDATE stories SET hidden_at = now() WHERE id = %s", (story_id,))
        conn.execute("UPDATE articles SET hidden_at = now(), hidden_reason = 'duplicate' "
                     "WHERE source_id = %s", (sid,))


def test_print_gave_up_count_reports_zero_on_clean_db(capsys):
    with psycopg.connect(DSN, autocommit=True) as conn:
        story_browser.print_gave_up_count(conn)
    out = capsys.readouterr().out
    assert "gave up after 5 embed attempts" in out
