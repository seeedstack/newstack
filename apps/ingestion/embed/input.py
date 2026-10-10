"""Embedder input construction, version e1 (ARCHITECTURE §5). content_hash is the hash of
the EXACT string the model receives, so it must be computed from the post-truncation,
decoded text — never the raw pre-tokenization string."""
from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from typing import Callable

WHITESPACE_RE = re.compile(r"\s+")

Tokenizer = Callable[[str, int], str]


@dataclass
class EmbedInput:
    text: str
    content_hash: str
    title_only: bool


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    return WHITESPACE_RE.sub(" ", text).strip()


def _strip_denylist(text: str, patterns: list[str]) -> str:
    for pattern in patterns:
        text = re.sub(pattern, "", text).strip()
    return text


def build_embed_input(title: str, excerpt: str, denylist_patterns: list[str],
                       tokenize_and_decode: Tokenizer, max_tokens: int = 256) -> EmbedInput:
    title = _strip_denylist(_normalize(title), denylist_patterns)
    excerpt = _strip_denylist(_normalize(excerpt), denylist_patterns)
    title_only = not excerpt
    raw_input = title if title_only else f"{title}. {excerpt}"
    decoded = tokenize_and_decode(raw_input, max_tokens)
    content_hash = "e1:" + hashlib.sha256(decoded.encode("utf-8")).hexdigest()
    return EmbedInput(text=decoded, content_hash=content_hash, title_only=title_only)
