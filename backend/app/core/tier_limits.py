"""
Tier limits and validation
"""

TIER_LIMITS = {
    "free": {
        "watchlist_stocks": 5,
        "portfolio_entries": 5,
        "alerts": 0,
        "stock_reviews": 5,  # total
        "dcf_valuations": 0,
        "technical_analysis": False,
    },
    "casual": {
        "watchlist_stocks": 20,
        "portfolio_entries": 20,
        "alerts": 5,
        "stock_reviews": 5,  # per week
        "dcf_valuations": 5,  # per week
        "technical_analysis": True,
    },
    "active": {
        "watchlist_stocks": 45,
        "portfolio_entries": 45,
        "alerts": 20,
        "stock_reviews": 5,  # per day
        "dcf_valuations": 5,  # per day
        "technical_analysis": True,
    },
    "unlimited": {
        "watchlist_stocks": float('inf'),
        "portfolio_entries": float('inf'),
        "alerts": float('inf'),
        "stock_reviews": float('inf'),
        "dcf_valuations": float('inf'),
        "technical_analysis": True,
    },
}


def get_tier_limit(tier: str, limit_type: str) -> int | float | bool:
    """Get limit for a specific tier and limit type"""
    return TIER_LIMITS.get(tier, TIER_LIMITS["free"]).get(limit_type, 0)


def can_add_watchlist_stock(tier: str, current_count: int) -> bool:
    """Check if user can add more watchlist stocks"""
    limit = get_tier_limit(tier, "watchlist_stocks")
    return current_count < limit


def can_add_portfolio_entry(tier: str, current_count: int) -> bool:
    """Check if user can add more portfolio entries"""
    limit = get_tier_limit(tier, "portfolio_entries")
    return current_count < limit

def can_add_alert_entry(tier: str, current_count: int) -> bool:
    """Check if user can add more alerts"""
    limit = get_tier_limit(tier, "alerts")
    return current_count < limit