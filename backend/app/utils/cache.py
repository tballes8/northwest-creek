"""
Simple in-memory cache for API responses
"""
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Any

class SimpleCache:
    def __init__(self):
        self._cache: Dict[str, tuple[Any, datetime]] = {}
        self._ttl = timedelta(seconds=60)  # Cache for 60 seconds
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached value if not expired"""
        if key in self._cache:
            value, timestamp = self._cache[key]
            if datetime.now(timezone.utc) - timestamp < self._ttl:
                return value
            else:
                # Expired, remove it
                del self._cache[key]
        return None
    
    def set(self, key: str, value: Any):
        """Set cache value with current timestamp"""
        self._cache[key] = (value, datetime.now(timezone.utc))
    
    def clear(self):
        """Clear all cache"""
        self._cache.clear()

# Global cache instance
quote_cache = SimpleCache()