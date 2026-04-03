"""
Tier limits and validation
Updated: Free → Beginner ($10/mo, 14-day trial), Casual gets SMS + 14-day trial
All tiers now use "beginner" as the base tier (no free tier)
Sprint 8: added sms_alerts and indicator_alerts limits
"""

TIER_LIMITS = {
    "beginner": {
        "watchlist_stocks": 10,
        "portfolio_entries": 10,
        "alerts": 5,
        "sms_alerts": False,
        "indicator_alerts": 0,
        "stock_reviews": 5,           # per week
        "dcf_valuations": 5,          # per week
        "technical_analysis": 5,      # per week
        "ai_analysis": 0,             # not available

        "review_period": "week",
        "trial_days": 14,
    },
    "casual": {
        "watchlist_stocks": 20,
        "portfolio_entries": 20,
        "alerts": 10,
        "sms_alerts": True,
        "indicator_alerts": 0,
        "stock_reviews": 15,          # per week
        "dcf_valuations": 15,         # per week
        "technical_analysis": 15,     # per week
        "ai_analysis": 5,             # per week

        "review_period": "week",
        "trial_days": 14,
    },
    "active": {
        "watchlist_stocks": 45,
        "portfolio_entries": 45,
        "alerts": 20,
        "sms_alerts": True,
        "indicator_alerts": 5,
        "stock_reviews": 20,          # per day
        "dcf_valuations": 20,         # per day
        "technical_analysis": 20,     # per day
        "ai_analysis": 10,            # per day

        "review_period": "day",
    },
    "professional": {
        "watchlist_stocks": 75,
        "portfolio_entries": 75,
        "alerts": 50,
        "sms_alerts": True,
        "indicator_alerts": 20,
        "stock_reviews": 40,          # per day
        "dcf_valuations": 40,         # per day
        "technical_analysis": 40,     # per day
        "ai_analysis": 25,            # per day

        "review_period": "day",
        "ad_free": True,
    },
}

# Default tier for new users and fallback lookups
DEFAULT_TIER = "beginner"


def get_tier_limit(tier: str, limit_type: str):
    """Get limit for a specific tier and limit type"""
    return TIER_LIMITS.get(tier, TIER_LIMITS[DEFAULT_TIER]).get(limit_type, 0)


def get_review_period(tier: str) -> str:
    """Get the review period for a tier (total, week, or day)"""
    return TIER_LIMITS.get(tier, TIER_LIMITS[DEFAULT_TIER]).get("review_period", "total")


def get_trial_days(tier: str) -> int:
    """Get the trial period in days for a tier (0 if no trial)"""
    return TIER_LIMITS.get(tier, TIER_LIMITS[DEFAULT_TIER]).get("trial_days", 0)


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


def can_use_sms_alerts(tier: str) -> bool:
    """Check if user's tier allows SMS text alerts"""
    return bool(get_tier_limit(tier, "sms_alerts"))


def can_use_feature(tier: str, feature: str, current_count: int) -> bool:
    """Generic check — can the user use this feature one more time?"""
    limit = get_tier_limit(tier, feature)
    if isinstance(limit, bool):
        return limit
    return current_count < limit


def get_upgrade_tier(current_tier: str) -> str | None:
    """Get the next tier up for upgrade prompts"""
    upgrade_path = {
        "beginner": "casual",
        "casual": "active",
        "active": "professional",
        "professional": None,
    }
    return upgrade_path.get(current_tier)


def get_tier_display_name(tier: str) -> str:
    """Get human-readable tier name"""
    names = {
        "beginner": "Beginner",
        "casual": "Casual Retail Investor",
        "active": "Active Retail Investor",
        "professional": "Professional Investor",
    }
    return names.get(tier, "Beginner")