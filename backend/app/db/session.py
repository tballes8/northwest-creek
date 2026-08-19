from sqlalchemy.ext.asyncio import async_sessionmaker
from app.config import get_settings
from app.db.engine import make_async_engine

settings = get_settings()

engine = make_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)

async_session = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with async_session() as session:
        yield session
