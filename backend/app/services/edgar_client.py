"""
Shared HTTP client for SEC EDGAR.

This is **the** place in the app that talks to sec.gov / data.sec.gov. Every
EDGAR reader — identity resolution (`edgar_identity`), dividend facts
(`edgar_dividends`), the bankruptcy 8-K check (`sec_filings`) — goes through
`edgar_get()` so that three things stay singular:

1. **One User-Agent.** The SEC's fair-access policy rejects requests without a
   descriptive UA and contact email (HTTP 403). It comes from
   `settings.SEC_USER_AGENT`.
2. **One throttle.** The SEC limit is 10 req/sec *per IP*. A limiter that lives
   on a client instance does not compose with a second limiter in another
   module — two modules each politely doing 8/sec is 16/sec from one IP. The
   limiter here is module state for exactly that reason.
3. **One connection pool.** Initialized at startup via `init_edgar_client()`
   and closed via `close_edgar_client()`, mirroring `fmp_client`.

Callers outside a request context (CLI, cron) can use `edgar_get()` without
`init_edgar_client()` — it falls back to a short-lived client. That path pays a
TLS handshake per call and is not for the hot path.
"""
import asyncio
import time

import httpx

from app.config import get_settings

# SEC's documented ceiling is 10 req/sec per IP; 8 leaves margin for retries
# and for anything else sharing the egress IP.
MAX_REQUESTS_PER_SECOND = 8.0

_client: httpx.AsyncClient | None = None


class _RateLimiter:
    """Minimum-interval throttle. Serializes requests to <= max_per_second."""

    def __init__(self, max_per_second: float) -> None:
        self._min_interval = 1.0 / max_per_second
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            delta = now - self._last
            if delta < self._min_interval:
                await asyncio.sleep(self._min_interval - delta)
            self._last = time.monotonic()


# Module-level: shared by every EDGAR caller in the process. See docstring (2).
_limiter = _RateLimiter(MAX_REQUESTS_PER_SECOND)


def _headers() -> dict[str, str]:
    # Settings are read lazily, not at import: this module is importable (and
    # its pure logic testable) without a populated .env.
    #
    # gzip matters: company_tickers.json is ~1MB uncompressed and the SEC serves
    # it gzipped. httpx decompresses transparently.
    return {
        "User-Agent": get_settings().SEC_USER_AGENT,
        "Accept-Encoding": "gzip, deflate",
    }


async def init_edgar_client() -> None:
    global _client
    _client = httpx.AsyncClient(
        timeout=15.0,
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
    )


async def close_edgar_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def edgar_get(url: str, *, max_retries: int = 3) -> httpx.Response:
    """
    Rate-limited GET against EDGAR, with backoff on 429/5xx.

    Returns the response for 2xx **and for 404** — a missing CIK or an untagged
    concept is a data condition every caller has to handle, not an error worth
    raising. 403 raises `PermissionError`, because it is almost always a bad
    User-Agent (a config problem) rather than anything about the ticker.
    """
    attempt = 0
    while True:
        await _limiter.wait()

        if _client is not None:
            resp = await _client.get(url, headers=_headers())
        else:
            # CLI / cron fallback — no shared pool. Still throttled.
            async with httpx.AsyncClient(timeout=15.0) as ad_hoc:
                resp = await ad_hoc.get(url, headers=_headers())

        if resp.status_code == 403:
            raise PermissionError(
                "EDGAR returned 403 Forbidden. This is almost always a bad or "
                "missing User-Agent header, not a data problem. Check "
                "SEC_USER_AGENT (it must name the app and a real contact email)."
            )
        if resp.status_code == 404:
            return resp
        if resp.status_code == 429 or resp.status_code >= 500:
            if attempt >= max_retries:
                resp.raise_for_status()
            await asyncio.sleep(min(2 ** attempt, 8) + 0.25)
            attempt += 1
            continue

        resp.raise_for_status()
        return resp
