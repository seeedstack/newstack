"""T2/T3 DB applicator (ARCHITECTURE §6). T3 only applies decide()'s result; every rule
about *which* story an article joins lives in the pure decide() function."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import psycopg
from pgvector.psycopg import register_vector

from clustering.decide import Candidate, Config, decide

CANDIDATES_SQL = """
SELECT id, representative_embedding, event_last_updated_at
FROM stories
WHERE status = 'active' AND hidden_at IS NULL
  AND cluster_version = %(active_cluster_version)s
  AND event_last_updated_at >= %(effective_at)s - interval '72 hours'
  AND first_seen_at         <= %(effective_at)s + interval '72 hours'
UNION
SELECT id, representative_embedding, event_last_updated_at
FROM stories
WHERE id = %(current_story_id)s AND status = 'active' AND hidden_at IS NULL
  AND cluster_version = %(active_cluster_version)s
"""

TOMBSTONE_SQL = """
UPDATE stories s
   SET status = 'tombstoned', tombstoned_at = now(),
       merged_into = (SELECT l.new_story_id
                      FROM story_lineage l JOIN stories n ON n.id = l.new_story_id
                      WHERE l.old_story_id = s.id AND n.status = 'active'
                      ORDER BY l.article_count DESC, n.last_coverage_at DESC, l.new_story_id
                      LIMIT 1)
 WHERE s.id = %(old_story_id)s AND s.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.story_id = s.id)
"""

LINEAGE_SQL = """
INSERT INTO story_lineage (old_story_id, new_story_id, article_count)
VALUES (%(old_story_id)s, %(new_story_id)s, 1)
ON CONFLICT (old_story_id, new_story_id) DO UPDATE
  SET article_count = story_lineage.article_count + 1
"""


class StaleWriteError(Exception):
    """I5: content_hash changed since EMBED read the input."""


@dataclass
class ClusterOutcome:
    action: str
    story_id: str


def _cosine_similarity(a: list[float], b) -> float:
    b = list(b)
    dot = sum(x * float(y) for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(float(y) * float(y) for y in b))
    return dot / (norm_a * norm_b)


def apply_embed_result(conn: psycopg.Connection, *, article_id: str, h: str, vector: list[float],
                        embedding_model_id: str, title: str, excerpt: str,
                        cfg: Config = Config()) -> ClusterOutcome:
    register_vector(conn)
    with conn.transaction():
        row = conn.execute(
            "SELECT content_hash, story_id, effective_at, coverage_at FROM articles "
            "WHERE id = %(id)s FOR UPDATE", {"id": article_id}
        ).fetchone()
        current_hash, current_story_id, effective_at, coverage_at = row
        if current_hash != h:
            raise StaleWriteError(f"article {article_id} content_hash changed since EMBED read it")

        active_cluster_version = conn.execute(
            "SELECT active_cluster_version FROM clustering_state FOR SHARE"
        ).fetchone()[0]

        candidate_rows = conn.execute(CANDIDATES_SQL, {
            "active_cluster_version": active_cluster_version,
            "effective_at": effective_at,
            "current_story_id": current_story_id,
        }).fetchall()
        candidates = [
            Candidate(story_id=str(sid), similarity=_cosine_similarity(vector, rep_vec),
                      event_last_updated_at=event_last_updated_at)
            for sid, rep_vec, event_last_updated_at in candidate_rows
        ]
        decision = decide(candidates, str(current_story_id) if current_story_id else None, cfg)

        if decision.action == "CREATE":
            target_story_id = str(conn.execute(
                "INSERT INTO stories (title, summary, headline_article_id, representative_embedding, "
                "representative_embedding_model, cluster_version, status, "
                "first_seen_at, event_last_updated_at, last_coverage_at) "
                "VALUES (%(title)s, %(summary)s, %(article_id)s, %(vector)s, %(model_id)s, "
                "%(cluster_version)s, 'active', %(effective_at)s, %(effective_at)s, %(coverage_at)s) "
                "RETURNING id",
                {"title": title, "summary": excerpt, "article_id": article_id, "vector": vector,
                 "model_id": embedding_model_id, "cluster_version": active_cluster_version,
                 "effective_at": effective_at, "coverage_at": coverage_at},
            ).fetchone()[0])
        else:
            target_story_id = decision.story_id

        conn.execute(
            "UPDATE articles SET embedding = %(vector)s, embedding_model = %(model_id)s, "
            "embedded_content_hash = %(h)s, story_id = %(story_id)s, "
            "cluster_version = %(cluster_version)s, embed_attempts = 0 WHERE id = %(id)s",
            {"vector": vector, "model_id": embedding_model_id, "h": h, "story_id": target_story_id,
             "cluster_version": active_cluster_version, "id": article_id},
        )

        if decision.action == "MOVE":
            conn.execute(LINEAGE_SQL, {"old_story_id": current_story_id, "new_story_id": target_story_id})
            conn.execute(TOMBSTONE_SQL, {"old_story_id": current_story_id})

    return ClusterOutcome(action=decision.action, story_id=target_story_id)


def _record_embed_failure(conn: psycopg.Connection, article_id: str, error: str) -> None:
    with conn.transaction():
        conn.execute(
            "UPDATE articles SET embed_attempts = embed_attempts + 1, last_embed_attempt_at = now(), "
            "last_embed_error = %(error)s WHERE id = %(id)s",
            {"error": error[:2000], "id": article_id},
        )


def process_article(conn: psycopg.Connection, *, article_id: str, title: str, excerpt: str,
                     denylist_patterns: list[str]) -> Literal["CLUSTERED", "PENDING"]:
    """EMBED (no open transaction) then T3, or T2 on any failure (ARCHITECTURE §6 state machine)."""
    from embed.input import build_embed_input
    from embed.model import EMBEDDING_MODEL_ID, EmbeddingFailedError, embed, tokenize_and_decode

    embed_input = build_embed_input(title, excerpt, denylist_patterns, tokenize_and_decode)
    try:
        vector = embed(embed_input.text)
        apply_embed_result(conn, article_id=article_id, h=embed_input.content_hash, vector=vector,
                            embedding_model_id=EMBEDDING_MODEL_ID, title=title, excerpt=excerpt)
        return "CLUSTERED"
    except (EmbeddingFailedError, StaleWriteError, psycopg.Error) as e:
        _record_embed_failure(conn, article_id, error=str(e))
        return "PENDING"
