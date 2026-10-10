"""SSRF-safe fetch guard (ARCHITECTURE §5). Every outbound RSS fetch goes through this.

Resolves DNS once, rejects any resolved address that is loopback/private/link-local/CGNAT/
multicast/reserved/unspecified/cloud-metadata, then connects to that exact vetted IP — never
re-resolving for the actual connection — so DNS rebinding between the check and the connect
cannot swap the target. Redirects are followed manually, each hop re-validated from the top,
capped at 3. TLS SNI/certificate validation still uses the real hostname via the
`sni_hostname` request extension, even though the connection goes to the IP literal.
"""
from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

import httpx

ALLOWED_SCHEMES = {"http", "https"}
ALLOWED_PORTS = {80, 443}
ALLOWED_CONTENT_TYPES = {
    "application/rss+xml", "application/atom+xml", "application/xml", "text/xml",
}
MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 8.0
MAX_BYTES = 5 * 1024 * 1024
USER_AGENT = "NewstackBot/1.0 (+https://newstack.example/bot)"
CGNAT_V4 = ipaddress.ip_network("100.64.0.0/10")
CLOUD_METADATA_IPS = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("fd00:ec2::254"),
}


class FetchGuardError(Exception):
    pass


@dataclass
class FetchResult:
    status_code: int
    body: bytes
    content_type: str
    headers: httpx.Headers


def _is_blocked(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    if addr in CLOUD_METADATA_IPS:
        return True
    if isinstance(addr, ipaddress.IPv4Address) and addr in CGNAT_V4:
        return True
    return (addr.is_loopback or addr.is_private or addr.is_link_local
            or addr.is_multicast or addr.is_reserved or addr.is_unspecified)


def _resolve_and_vet(hostname: str) -> str:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise FetchGuardError(f"DNS resolution failed for {hostname}: {e}") from e
    addresses = {ipaddress.ip_address(info[4][0]) for info in infos}
    if not addresses:
        raise FetchGuardError(f"no addresses resolved for {hostname}")
    blocked = [a for a in addresses if _is_blocked(a)]
    if blocked:
        raise FetchGuardError(f"{hostname} resolves to a blocked address: {blocked}")
    return str(next(iter(addresses)))


def _validate_url(url: str) -> tuple[str, str, int]:
    parts = urlsplit(url)
    if parts.scheme not in ALLOWED_SCHEMES:
        raise FetchGuardError(f"scheme not allowed: {parts.scheme!r}")
    if not parts.hostname:
        raise FetchGuardError("missing host")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise FetchGuardError(f"port not allowed: {port}")
    ip = _resolve_and_vet(parts.hostname)
    return ip, parts.hostname, port


def fetch(url: str, *, etag: str | None = None, last_modified: str | None = None,
          transport: httpx.BaseTransport | None = None) -> FetchResult:
    current_url = url
    for _hop in range(MAX_REDIRECTS + 1):
        ip, hostname, port = _validate_url(current_url)
        parts = urlsplit(current_url)
        netloc = ip if port in (80, 443) else f"{ip}:{port}"
        pinned_url = urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))

        headers = {"User-Agent": USER_AGENT, "Host": hostname}
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified

        with httpx.Client(timeout=TIMEOUT_SECONDS, follow_redirects=False, transport=transport) as client:
            request = client.build_request("GET", pinned_url, headers=headers, extensions={"sni_hostname": hostname})
            response = client.send(request, stream=True)
            try:
                if response.status_code == 304:
                    return FetchResult(304, b"", "", response.headers)

                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise FetchGuardError("redirect with no Location header")
                    current_url = str(httpx.URL(current_url).join(location))
                    continue

                content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if content_type not in ALLOWED_CONTENT_TYPES:
                    raise FetchGuardError(f"content-type not allowed: {content_type!r}")

                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_BYTES:
                        raise FetchGuardError(f"response exceeded {MAX_BYTES} bytes decompressed")
                return FetchResult(response.status_code, bytes(body), content_type, response.headers)
            finally:
                response.close()
    raise FetchGuardError(f"too many redirects (> {MAX_REDIRECTS})")
