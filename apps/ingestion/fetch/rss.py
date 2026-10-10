"""RSS parsing and per-item normalization (ARCHITECTURE §5). Publisher quirks are config
(adapter dicts from config.load_source_adapter), never code branches."""
from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import feedparser

from canonical import canonicalize

TAG_RE = re.compile(r"<[^>]+>")
WORD_BOUNDARY = re.compile(r"\s")


def _strip_html(text: str) -> str:
    return html.unescape(TAG_RE.sub("", text or "")).strip()


def _truncate_at_word_boundary(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    last_space = cut.rfind(" ")
    return cut[:last_space] if last_space > 0 else cut


def _first_nonempty(entry: dict, fields: list[str]) -> str:
    for field in fields:
        if field == "content":
            content = entry.get("content")
            if content:
                return content[0].get("value", "")
        else:
            value = entry.get(field)
            if value:
                return value
    return ""


def _parsed_date(entry: dict, date_fields: list[str]) -> Optional[datetime]:
    for field in date_fields:
        struct = entry.get(f"{field}_parsed")
        if struct:
            return datetime(*struct[:6], tzinfo=timezone.utc)
    return None


def _image_url(entry: dict) -> Optional[str]:
    thumbs = entry.get("media_thumbnail")
    url = thumbs[0]["url"] if thumbs else None
    if not url:
        for link in entry.get("links", []):
            if link.get("rel") == "enclosure" and link.get("type", "").startswith("image/"):
                url = link.get("href")
                break
    if not url or not url.startswith("https://") or len(url) > 2048:
        return None
    return url


@dataclass
class NormalizedItem:
    title: str
    url: str
    canonical_url: str
    canonicalization_version: str
    guid: Optional[str]
    excerpt: str
    author: Optional[str]
    image_url: Optional[str]
    published_at: Optional[datetime]


@dataclass
class ParsedFeed:
    items: list[NormalizedItem]
    items_seen: int
    items_rejected: int
    unparseable_dates: int


def parse_feed(xml_bytes: bytes, adapter_cfg: dict) -> ParsedFeed:
    parsed = feedparser.parse(xml_bytes)
    items: list[NormalizedItem] = []
    items_rejected = 0
    unparseable_dates = 0

    for entry in parsed.entries:
        raw_title = entry.get("title", "")
        if not raw_title.strip():
            items_rejected += 1
            continue

        title = _strip_html(raw_title)
        for pattern in adapter_cfg["title_cleanup"]:
            title = re.sub(pattern, "", title).strip()
        title = _truncate_at_word_boundary(title, 1000)

        excerpt = _strip_html(_first_nonempty(entry, adapter_cfg["excerpt_source"]))
        excerpt = _truncate_at_word_boundary(excerpt, 5000)

        published_at = _parsed_date(entry, adapter_cfg["date_fields"])
        if published_at is None:
            unparseable_dates += 1

        url = entry.get("link", "")
        canonical_url = canonicalize(
            url,
            host_aliases=adapter_cfg["host_aliases"],
            extra_tracking=adapter_cfg["extra_tracking_params"],
            keep_hashbang=adapter_cfg["keep_hashbang"],
        )

        items.append(NormalizedItem(
            title=title, url=url, canonical_url=canonical_url, canonicalization_version="c1",
            guid=entry.get("id") or entry.get("guid"), excerpt=excerpt,
            author=entry.get("author"), image_url=_image_url(entry), published_at=published_at,
        ))

    items.sort(key=lambda i: i.published_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    kept = items[: adapter_cfg["max_items_per_run"]]
    return ParsedFeed(items=kept, items_seen=len(parsed.entries),
                       items_rejected=items_rejected, unparseable_dates=unparseable_dates)
