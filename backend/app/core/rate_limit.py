"""
In-memory sliding-window rate limits for the unauthenticated endpoints that send
email or check passwords (register, login, forgot-password, resend-verification).

The API runs as a single uvicorn worker, so process memory sees every request; a
restart resets the counters, which is acceptable for abuse limits. Key limits by
both client IP and target email: the per-email limit is what protects a victim's
inbox even if an attacker rotates or spoofs IPs.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_hits: dict[str, deque] = defaultdict(deque)
_calls_since_sweep = 0
_SWEEP_EVERY = 1000
_MAX_WINDOW_SECONDS = 3600  # longest window in use; older hits are irrelevant


def client_ip(request: Request) -> str:
    """Best-effort client IP behind Cloudflare (CF-Connecting-IP) and Railway's proxy."""
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return (
        request.headers.get("cf-connecting-ip")
        or forwarded
        or (request.client.host if request.client else "unknown")
    )


def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """Record a hit for `key`; raise 429 if it exceeds `limit` within the window."""
    global _calls_since_sweep
    now = time.monotonic()

    _calls_since_sweep += 1
    if _calls_since_sweep >= _SWEEP_EVERY:
        _calls_since_sweep = 0
        for k in [k for k, q in _hits.items() if not q or now - q[-1] > _MAX_WINDOW_SECONDS]:
            del _hits[k]

    hits = _hits[key]
    while hits and now - hits[0] > window_seconds:
        hits.popleft()
    if len(hits) >= limit:
        retry_after = int(window_seconds - (now - hits[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Please try again in {_human(retry_after)}.",
            headers={"Retry-After": str(retry_after)},
        )
    hits.append(now)


def _human(seconds: int) -> str:
    if seconds < 90:
        return f"{seconds} seconds"
    return f"{round(seconds / 60)} minutes"
