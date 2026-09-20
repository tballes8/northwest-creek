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
        "saved_screens": 0,
        "stock_reviews": 5,           # per week
        "dcf_valuations": 5,          # per week
        "relval_valuations": 0,       # not available (below RELVAL_MIN_TIER)
        "technical_analysis": 5,      # per week
        "watchlist_screens": 0,       # not available (active+)
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
        "saved_screens": 0,
        "stock_reviews": 15,          # per week
        "dcf_valuations": 15,         # per week
        "relval_valuations": 15,      # per week
        "technical_analysis": 15,     # per week
        "watchlist_screens": 0,       # not available (active+)
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
        "saved_screens": 15,
        "stock_reviews": 20,          # per day
        "dcf_valuations": 20,         # per day
        "relval_valuations": 20,      # per day
        "technical_analysis": 10,     # per day (70/wk — above casual's 15/wk)
        "watchlist_screens": 5,       # per day — each screen costs 1 fetch per watchlist ticker
        "ai_analysis": 10,            # per day

        "review_period": "day",
    },
    "professional": {
        "watchlist_stocks": 75,
        "portfolio_entries": 75,
        "alerts": 50,
        "sms_alerts": True,
        "indicator_alerts": 20,
        "saved_screens": 50,
        "stock_reviews": 40,          # per day
        "dcf_valuations": 40,         # per day
        "relval_valuations": 40,      # per day
        "technical_analysis": 20,     # per day (140/wk)
        "watchlist_screens": 15,      # per day — each screen costs 1 fetch per watchlist ticker
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


# ═══════════════════════════════════════════════════════════════════════════
# Self-test — pure, offline.
#
#   python -m app.core.tier_limits --selftest
#
# Exists because the limits are stated in two different periods: beginner and
# casual are per WEEK, active and professional are per DAY. Comparing the raw
# numbers across that boundary is misleading — active's 10/day looks smaller
# than casual's 15/week but is nearly five times larger. Anything that reads a
# limit must normalize first, and this asserts every ladder still climbs once
# normalized.
# ═══════════════════════════════════════════════════════════════════════════

TIER_ORDER = ["beginner", "casual", "active", "professional"]

# Counted features only — booleans (sms_alerts, ad_free) and caps that are not
# per-period (watchlist_stocks, portfolio_entries, alerts, saved_screens,
# indicator_alerts) are not rate limits and are excluded.
_METERED = ["stock_reviews", "dcf_valuations", "relval_valuations",
            "technical_analysis", "watchlist_screens", "ai_analysis"]

# Features unavailable below a minimum tier — a 0 on a lower tier is intentional,
# not a missing limit.
WATCHLIST_SCREEN_MIN_TIERS = ("active", "professional")


def weekly_equivalent(tier: str, feature: str) -> float:
    """A tier's limit normalized to per-week, so tiers are actually comparable."""
    limit = get_tier_limit(tier, feature)
    return limit * 7 if get_review_period(tier) == "day" else limit


def _selftest() -> int:
    for feature in _METERED:
        prev_tier, prev = None, 0.0
        for tier in TIER_ORDER:
            wk = weekly_equivalent(tier, feature)
            if wk == 0:
                # 0 means "not available on this tier" — legitimate for features
                # gated above a minimum tier (relval, ai_analysis on beginner).
                # It must never reappear as unavailable on a HIGHER tier.
                assert prev == 0, f"{feature}: available on {prev_tier} but not on {tier}"
            elif prev:
                assert wk > prev, (
                    f"{feature}: {tier} ({wk:g}/wk) is not more generous than "
                    f"{prev_tier} ({prev:g}/wk) — paying more must never buy less"
                )
            prev_tier, prev = tier, wk
        assert prev > 0, f"{feature} is unavailable on every tier"

    # The case that actually caused confusion: raw numbers invert, weekly ones don't.
    assert get_tier_limit("active", "technical_analysis") < get_tier_limit("casual", "technical_analysis")
    assert weekly_equivalent("active", "technical_analysis") > weekly_equivalent("casual", "technical_analysis")

    assert get_review_period("beginner") == "week" and get_review_period("active") == "day"
    assert get_upgrade_tier("professional") is None
    assert get_upgrade_tier("beginner") == "casual"

    print("tier_limits selftest: OK")
    for feature in _METERED:
        row = "  ".join(f"{t[:4]}={weekly_equivalent(t, feature):g}" for t in TIER_ORDER)
        print(f"  {feature:22s} per week: {row}")
    return 0


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        raise SystemExit(_selftest())
    print("usage: python -m app.core.tier_limits --selftest")
    raise SystemExit(2)
