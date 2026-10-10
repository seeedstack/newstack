"""T1 upsert (ARCHITECTURE §5). One statement, copied from the doc; only the parameter
syntax (:name -> %(name)s) differs. The state-machine decision (Task 13) is made from the
RETURNING row, never from `inserted` (that only feeds the articles_inserted metric)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import psycopg

UPSERT_SQL = """
INSERT INTO articles (source_id, title, url, canonical_url, canonicalization_version, guid, excerpt,
                      author, image_url, language, section, published_at, content_hash, skip_reason,
                      effective_at)
VALUES (%(source_id)s, %(title)s, %(url)s, %(canonical_url)s, %(canonicalization_version)s, %(guid)s,
        %(excerpt)s, %(author)s, %(image_url)s, %(language)s, %(section)s, %(published_at)s,
        %(content_hash)s, %(skip_reason)s,
        LEAST(COALESCE(%(published_at)s, now()), now()))
ON CONFLICT (source_id, canonical_url) DO UPDATE SET
  title = EXCLUDED.title, url = EXCLUDED.url, guid = EXCLUDED.guid, excerpt = EXCLUDED.excerpt,
  author = EXCLUDED.author, image_url = EXCLUDED.image_url, language = EXCLUDED.language,
  section = EXCLUDED.section, published_at = EXCLUDED.published_at,
  content_hash   = EXCLUDED.content_hash,
  embed_attempts = CASE WHEN articles.content_hash IS DISTINCT FROM EXCLUDED.content_hash
                        THEN 0 ELSE articles.embed_attempts END,
  skip_reason    = CASE WHEN articles.embedding IS NULL
                        THEN EXCLUDED.skip_reason ELSE articles.skip_reason END,
  effective_at   = LEAST(COALESCE(EXCLUDED.published_at, articles.first_scraped_at),
                         articles.first_scraped_at),
  last_fetched_at = now(), updated_at = now()
RETURNING id, content_hash, embedded_content_hash, embed_attempts, skip_reason,
          story_id, effective_at, hidden_at IS NOT NULL AS hidden, (xmax = 0) AS inserted
"""


@dataclass
class UpsertResult:
    id: str
    content_hash: str
    embedded_content_hash: Optional[str]
    embed_attempts: int
    skip_reason: Optional[str]
    story_id: Optional[str]
    effective_at: datetime
    hidden: bool
    inserted: bool


def upsert_article(conn: psycopg.Connection, *, source_id: str, title: str, url: str,
                    canonical_url: str, canonicalization_version: str, guid: Optional[str],
                    excerpt: str, author: Optional[str], image_url: Optional[str],
                    language: Optional[str], section: Optional[str],
                    published_at: Optional[datetime], content_hash: str,
                    skip_reason: Optional[str]) -> UpsertResult:
    with conn.cursor() as cur:
        cur.execute(UPSERT_SQL, dict(
            source_id=source_id, title=title, url=url, canonical_url=canonical_url,
            canonicalization_version=canonicalization_version, guid=guid, excerpt=excerpt,
            author=author, image_url=image_url, language=language, section=section,
            published_at=published_at, content_hash=content_hash, skip_reason=skip_reason,
        ))
        row = cur.fetchone()
    conn.commit()
    return UpsertResult(*row)
