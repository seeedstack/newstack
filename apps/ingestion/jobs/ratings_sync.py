"""Ratings-sync job (PRODUCT §5.1). Reads ratings/IN/<domain>.yaml (one file per source per
spectrum, reviewed in the ratings repo's own CI) and applies each via the atomic
rating-revision transaction (ARCHITECTURE §10)."""
from __future__ import annotations

import json
import pathlib

import psycopg
import yaml

RATINGS_ROOT = pathlib.Path(__file__).resolve().parents[3] / "ratings"

REVISION_SQL = """
INSERT INTO source_ratings (source_id, spectrum, bias_rating, factuality, confidence, method,
                            method_version, rated_by, second_rater, rubric_scores, evidence,
                            review_due_at, source_ref, notes, supersedes)
VALUES (%(source_id)s, %(spectrum)s, %(bias)s, %(fact)s, %(confidence)s, %(method)s,
        %(method_version)s, %(by)s, %(second_rater)s, %(rubric_scores)s::jsonb, %(evidence)s::jsonb,
        %(review_due_at)s, %(source_ref)s, %(notes)s, %(old_id)s)
RETURNING id
"""


def sync_one(conn: psycopg.Connection, rating: dict, source_ref: str) -> str:
    with conn.transaction():
        source_row = conn.execute(
            "SELECT id FROM sources WHERE domain = %(domain)s FOR UPDATE", {"domain": rating["source"]}
        ).fetchone()
        if source_row is None:
            raise ValueError(f"no source with domain {rating['source']!r} — onboard it first")
        source_id = source_row[0]

        old = conn.execute(
            "UPDATE source_ratings SET superseded_at = now() "
            "WHERE source_id = %(source_id)s AND superseded_at IS NULL RETURNING id",
            {"source_id": source_id},
        ).fetchone()
        old_id = old[0] if old else None

        raters = rating.get("raters", [])
        new_id = conn.execute(REVISION_SQL, {
            "source_id": source_id,
            "spectrum": rating.get("spectrum"),
            "bias": rating.get("bias"),
            "fact": rating["factuality"],
            "confidence": rating.get("confidence"),
            "method": rating["method"],
            "method_version": rating.get("method_version"),
            "by": raters[0] if raters else None,
            "second_rater": raters[1] if len(raters) > 1 else None,
            "rubric_scores": json.dumps(rating["rubric_scores"]) if rating.get("rubric_scores") else None,
            "evidence": json.dumps(rating["evidence"]) if rating.get("evidence") else None,
            "review_due_at": rating.get("review_due"),
            "source_ref": source_ref,
            "notes": rating.get("notes"),
            "old_id": old_id,
        }).fetchone()[0]
    return str(new_id)


def sync_all(conn: psycopg.Connection, source_ref: str, ratings_root: pathlib.Path = RATINGS_ROOT) -> dict:
    synced = 0
    errors: list[str] = []
    for path in sorted(ratings_root.glob("IN/*.yaml")):
        with open(path, encoding="utf-8") as f:
            rating = yaml.safe_load(f)
        try:
            sync_one(conn, rating, source_ref)
            synced += 1
        except ValueError as e:
            errors.append(str(e))
    return {"synced": synced, "errors": errors}
