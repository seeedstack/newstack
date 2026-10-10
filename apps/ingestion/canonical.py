"""Canonical URL identity key, algorithm c1 (ARCHITECTURE §5).

The result is an IDENTITY KEY, never a link: it omits the scheme so http/https
variants of one article dedupe without rewriting any URL we display. The link
shown to users is always `articles.url`, as published.
"""
from __future__ import annotations

import re
from typing import Iterable, Mapping, Optional
from urllib.parse import parse_qsl, quote, urlsplit

VERSION = "c1"

TRACKING = re.compile(
    r"^(utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref|ref_src|ocid|cmpid|_ga|_gl|igshid)$",
    re.IGNORECASE,
)
UNRESERVED = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
DEFAULT_PORT = {"http": 80, "https": 443}


def _normalize_pct(s: str) -> str:
    """Decode %XX only for unreserved characters; uppercase every remaining escape."""
    def fix(m: re.Match) -> str:
        ch = chr(int(m.group(1), 16))
        return ch if ch in UNRESERVED else "%" + m.group(1).upper()
    return re.sub(r"%([0-9A-Fa-f]{2})", fix, s)


def _q(s: str) -> str:
    return quote(s, safe="-._~")


def canonicalize(url: str,
                 host_aliases: Optional[Mapping[str, str]] = None,
                 extra_tracking: Iterable[str] = (),
                 keep_hashbang: bool = True) -> str:
    parts = urlsplit(url.strip())
    scheme = parts.scheme.lower()
    if scheme not in DEFAULT_PORT:
        raise ValueError(f"unsupported scheme: {parts.scheme!r}")
    if not parts.hostname:
        raise ValueError("missing host")

    host = parts.hostname.rstrip(".")                      # urllib lowercases hostname
    host = host.encode("idna").decode("ascii")             # IDN → punycode
    host = (host_aliases or {}).get(host, host)            # per-source adapter aliases
    port = parts.port                                      # raises ValueError if invalid
    netloc = host if port in (None, DEFAULT_PORT[scheme]) else f"{host}:{port}"

    path = _normalize_pct(parts.path) or "/"
    if len(path) > 1:
        path = path.rstrip("/") or "/"                     # fixed policy: no trailing slash

    extra = {e.lower() for e in extra_tracking}
    params = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
              if not TRACKING.match(k) and k.lower() not in extra]
    params.sort()                                          # keys/values keep their case
    query = "&".join(f"{_q(k)}={_q(v)}" for k, v in params)

    frag = parts.fragment if keep_hashbang and parts.fragment.startswith("!") else ""
    return netloc + path + (f"?{query}" if query else "") + (f"#{frag}" if frag else "")
