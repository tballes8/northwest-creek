"""Single source of truth for async engine construction + connection pool policy.

Imported by both the API (app.db.session) and the standalone Railway cron
entry points in app.tasks. Deliberately free of import-time side effects — it
must not read settings or build an engine on import, so a cron process can use
the factory without also spinning up the API's pool.
"""
from sqlalchemy.ext.asyncio import create_async_engine

# Pool policy — sized for Railway managed Postgres.
#   pool_pre_ping: validate each connection on checkout, so a socket killed by a
#                  Postgres restart (e.g. Railway's automatic CVE patches) is
#                  transparently replaced instead of raising
#                  ConnectionDoesNotExistError to the caller.
#   pool_recycle:  proactively retire connections after 30 min so an idle socket
#                  never outlives a server-side or proxy idle timeout.
ENGINE_KWARGS = {
    "pool_pre_ping": True,
    "pool_recycle": 1800,
    "pool_size": 5,
    "max_overflow": 10,
    "pool_timeout": 30,
}


def normalize_db_url(url: str) -> str:
    """Railway emits postgres:// on some plugins; SQLAlchemy needs the
    postgresql+asyncpg:// form."""
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def make_async_engine(url: str, *, echo: bool = False, **overrides):
    """Build an async engine with the shared pool policy applied."""
    return create_async_engine(
        normalize_db_url(url), echo=echo, **{**ENGINE_KWARGS, **overrides}
    )
