"""Clustering decision engine (ARCHITECTURE §6). Pure: no I/O, no database, no clock.

Given the candidate stories (with similarities already computed) and the article's
current story, return exactly one Decision. The database transaction (T3) only
applies the decision; every rule about *which* story lives here.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Optional, Sequence

Action = Literal["ASSIGN", "CREATE", "STAY", "MOVE"]

# Boundary comparisons tolerate float rounding: 0.72 - 0.67 evaluates to
# 0.04999999999999993 in IEEE-754, which would otherwise flip a MOVE into a STAY.
EPS = 1e-9


@dataclass(frozen=True)
class Config:
    similarity_threshold: float = 0.72  # join an existing story at or above this
    stay_threshold: float = 0.67        # re-embed: stay in current story at or above this
    move_margin: float = 0.05           # re-embed: another story must beat current by this much


@dataclass(frozen=True)
class Candidate:
    story_id: str
    similarity: float
    event_last_updated_at: datetime


@dataclass(frozen=True)
class Decision:
    action: Action
    story_id: Optional[str]            # target story; None for CREATE
    best_similarity: Optional[float]   # best candidate other than the current story
    current_similarity: Optional[float]


def _ge(a: float, b: float) -> bool:
    return a >= b - EPS


def _rank_key(c: Candidate):
    # highest similarity, then most recently active story, then lowest id
    return (-c.similarity, -c.event_last_updated_at.timestamp(), c.story_id)


def decide(candidates: Sequence[Candidate], current_story_id: Optional[str],
           cfg: Config = Config()) -> Decision:
    ids = [c.story_id for c in candidates]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate candidate story")
    for c in candidates:
        if not math.isfinite(c.similarity) or not -1.0 - EPS <= c.similarity <= 1.0 + EPS:
            raise ValueError(f"invalid similarity {c.similarity!r} for {c.story_id}")

    current = None
    if current_story_id is not None:
        current = next((c for c in candidates if c.story_id == current_story_id), None)
    others = sorted((c for c in candidates if c.story_id != current_story_id), key=_rank_key)
    best = others[0] if others else None
    best_sim = best.similarity if best else None

    # First assignment — or the current story is not eligible (other epoch, tombstoned).
    if current is None:
        if best is not None and _ge(best.similarity, cfg.similarity_threshold):
            return Decision("ASSIGN", best.story_id, best_sim, None)
        return Decision("CREATE", None, best_sim, None)

    # Re-embed of an already-clustered article: hysteresis.
    s_cur = current.similarity
    if (best is not None and _ge(best.similarity, cfg.similarity_threshold)
            and _ge(best.similarity - s_cur, cfg.move_margin)):
        return Decision("MOVE", best.story_id, best_sim, s_cur)
    if _ge(s_cur, cfg.stay_threshold):
        return Decision("STAY", current.story_id, best_sim, s_cur)
    return Decision("CREATE", None, best_sim, s_cur)
