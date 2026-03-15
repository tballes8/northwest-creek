"""
Shared persistent HTTP client for Financial Modeling Prep (FMP) API.

Creates a single httpx.AsyncClient with connection pooling, reused across
all FMP calls. Must be initialized at app startup via init_fmp_client()
and closed at shutdown via close_fmp_client().
"""
import httpx
from app.config import get_settings

settings = get_settings()

FMP_BASE = "https://financialmodelingprep.com/stable/"
API_KEY = settings.MASSIVE_API_KEY

_client: httpx.AsyncClient | None = None


def get_fmp_client() -> httpx.AsyncClient:
    """Return the shared FMP client. Must call init_fmp_client() first."""
    assert _client is not None, "FMP client not initialized — call init_fmp_client() at startup"
    return _client


async def init_fmp_client() -> None:
    global _client
    _client = httpx.AsyncClient(
        base_url=FMP_BASE,
        timeout=15.0,
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
    )


async def close_fmp_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None
