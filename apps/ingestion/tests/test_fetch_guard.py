import socket

import httpx
import pytest

from fetch import guard as fetch_guard


def test_rejects_disallowed_scheme():
    with pytest.raises(fetch_guard.FetchGuardError, match="scheme"):
        fetch_guard.fetch("ftp://example.com/feed.xml")


def test_rejects_private_ip(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET, None, None, None, ("10.0.0.5", 0))])
    with pytest.raises(fetch_guard.FetchGuardError, match="blocked address"):
        fetch_guard.fetch("http://internal.example/feed.xml")


def test_rejects_ipv4_mapped_ipv6_cgnat(monkeypatch):
    """IPv4-mapped IPv6 CGNAT addresses (e.g. ::ffff:100.64.0.1) must be blocked.
    Regression test for attacker-controlled DNS returning IPv4-mapped IPv6 literals."""
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET6, None, None, None, ("::ffff:100.64.0.1", 0))])
    with pytest.raises(fetch_guard.FetchGuardError, match="blocked address"):
        fetch_guard.fetch("http://cgnat.example/feed.xml")


def test_rejects_cloud_metadata_ip(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET, None, None, None, ("169.254.169.254", 0))])
    with pytest.raises(fetch_guard.FetchGuardError, match="blocked address"):
        fetch_guard.fetch("http://metadata.example/feed.xml")


def test_rejects_disallowed_port(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET, None, None, None, ("93.184.216.34", 0))])
    with pytest.raises(fetch_guard.FetchGuardError, match="port"):
        fetch_guard.fetch("http://example.com:8080/feed.xml")


def test_redirect_to_blocked_address_is_rejected(monkeypatch):
    """A feed that 200s on first check then redirects to a blocked address must be rejected
    at the redirect hop, not just checked once up front (Review Focus item)."""
    calls = {"n": 0}

    def fake_getaddrinfo(host, port):
        calls["n"] += 1
        if host == "safe.example":
            return [(socket.AF_INET, None, None, None, ("93.184.216.34", 0))]
        return [(socket.AF_INET, None, None, None, ("169.254.169.254", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://evil.internal/feed.xml"})

    with pytest.raises(fetch_guard.FetchGuardError, match="blocked address"):
        fetch_guard.fetch("http://safe.example/feed.xml", transport=httpx.MockTransport(handler))
    assert calls["n"] == 2  # the redirect target was re-resolved and re-validated, not skipped


def test_too_many_redirects_rejected(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET, None, None, None, ("93.184.216.34", 0))])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://safe.example/next"})

    with pytest.raises(fetch_guard.FetchGuardError, match="too many redirects"):
        fetch_guard.fetch("http://safe.example/feed.xml", transport=httpx.MockTransport(handler))


def test_content_type_allowlist_enforced(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET, None, None, None, ("93.184.216.34", 0))])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html></html>")

    with pytest.raises(fetch_guard.FetchGuardError, match="content-type"):
        fetch_guard.fetch("http://safe.example/feed.xml", transport=httpx.MockTransport(handler))


def test_size_cap_enforced(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET, None, None, None, ("93.184.216.34", 0))])
    big = b"x" * (5 * 1024 * 1024 + 1)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "application/rss+xml"}, content=big)

    with pytest.raises(fetch_guard.FetchGuardError, match="exceeded"):
        fetch_guard.fetch("http://safe.example/feed.xml", transport=httpx.MockTransport(handler))


def test_successful_fetch_returns_body(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET, None, None, None, ("93.184.216.34", 0))])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "application/rss+xml"}, content=b"<rss></rss>")

    result = fetch_guard.fetch("http://safe.example/feed.xml", transport=httpx.MockTransport(handler))
    assert result.status_code == 200
    assert result.body == b"<rss></rss>"


def test_not_modified_short_circuits(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo",
                         lambda host, port: [(socket.AF_INET, None, None, None, ("93.184.216.34", 0))])

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["if-none-match"] == '"abc"'
        return httpx.Response(304)

    result = fetch_guard.fetch("http://safe.example/feed.xml", etag='"abc"',
                                transport=httpx.MockTransport(handler))
    assert result.status_code == 304
    assert result.body == b""
