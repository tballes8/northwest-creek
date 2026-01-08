"""
Redis cache utilities
"""
from redis.asyncio import Redis
from app.config import get_settings

settings = get_settings()

# Global redis client
_redis_client = None


async def get_cache() -> Redis:
    """
    Get Redis cache instance
    
    Yields:
        Redis client
    """
    global _redis_client
    
    if _redis_client is None:
        _redis_client = Redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
    
    try:
        yield _redis_client
    finally:
        pass  # Keep connection alive for reuse


async def close_cache():
    """Close Redis connection"""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None