"""
Stock AI analysis endpoint — on-demand plain-language summary of a stock's
technical indicators.  Shares the same ai_analysis usage pool as portfolio analysis.
"""
import re
import time
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.db.session import get_db
from app.api.dependencies import get_current_user
from app.db.models import User, FeatureUsage
from app.services.market_data import market_data_service
from app.services.technical_indicators import technical_indicators, generate_summary, INDICATOR_HISTORY_DAYS
from app.services.stock_analyzer import analyze_stock, forecast_stock_price
from app.services.financials_service import get_company_financials
from app.services.financial_fact_block import (
    build_fact_block,
    find_unsupported_numerals,
    MIN_QUARTERS,
)
from app.services.financial_analyzer import analyze_financials, NOTHING_NOTABLE
from app.services.sec_filings import detect_bankruptcy
from app.services.edgar_identity import is_contradicted
from app.services.dcf_service import UNSUITABLE_SECURITY_TYPES
from app.api.v1.endpoints.portfolio_analysis import check_ai_analysis_access
from app.core.tier_limits import get_tier_limit, get_upgrade_tier
from app.services.fx import get_reporting_currency
from app.services.valuation_check import vendor_per_share_ok

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory cache for price forecasts: ticker -> (timestamp, result_dict)
_forecast_cache: dict[str, tuple[float, dict]] = {}
_FORECAST_TTL = 6 * 3600  # 6 hours

# In-memory cache for the AI financials read: ticker -> (timestamp, payload).
# Mirrors _forecast_cache. There is no shared cache service to reach for: NWC runs
# no Redis/KV anywhere. Consequences, both already true of _forecast_cache and both
# fine: the cache is per-worker, and it is lost on redeploy.
_financials_ai_cache: dict[str, tuple[float, dict]] = {}
_FINANCIALS_AI_TTL = 24 * 3600      # statements change quarterly; 24h caps cost
_FINANCIALS_AI_SUPPRESSED_TTL = 3600  # shorter, so a mid-refresh ticker recovers same-day


def _safe_error(e: Exception) -> str:
    """Strip API keys and sensitive params from error messages."""
    msg = str(e)
    msg = re.sub(r'apiKey=[^&\s\'"]+', 'apiKey=***', msg)
    msg = re.sub(r'apikey=[^&\s\'"]+', 'apikey=***', msg)
    msg = re.sub(r'api_key=[^&\s\'"]+', 'api_key=***', msg)
    msg = re.sub(r'token=[^&\s\'"]+', 'token=***', msg)
    return msg


def _strip_history(indicator_data):
    """Remove large history arrays from indicator data."""
    if indicator_data is None:
        return None
    return {k: v for k, v in indicator_data.items() if not k.endswith("_history") and k != "history"}


@router.get("/stocks/{ticker}/ai-analysis")
async def stock_ai_analysis(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI plain-language summary of a stock's technical indicators."""

    await check_ai_analysis_access(current_user, db)

    try:
        # Fetch historical prices server-side (250 days for reliable indicator calc)
        historical = await market_data_service.get_historical_prices(ticker.upper(), INDICATOR_HISTORY_DAYS)
        if not historical or len(historical) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No historical data available for {ticker.upper()}",
            )

        prices = [float(day["close"]) for day in historical]
        highs = [float(day["high"]) for day in historical]
        lows = [float(day["low"]) for day in historical]
        volumes = [float(day["volume"]) for day in historical]
        current_price = prices[-1]

        # ── Calculate indicators ──────────────────────────────────────────
        # The same calls /technical-analysis/analyze and the alert checker make,
        # so this read describes the numbers the page shows.
        rsi = technical_indicators.calculate_rsi(prices)
        macd_data = technical_indicators.calculate_macd(prices)
        ma_data = technical_indicators.calculate_moving_averages(prices)
        bb_data = technical_indicators.calculate_bollinger_bands(prices)

        advanced = {}
        try:
            advanced = technical_indicators.calculate_all_advanced(highs, lows, prices, volumes)
        except Exception:
            # Our own calc, not a vendor call — a failure here is a bug; keep the traceback
            logger.exception("Advanced indicators failed for %s", ticker)

        summary = generate_summary(rsi, macd_data, ma_data, bb_data, current_price, advanced)

        # ── Assemble flat indicator dict for the AI prompt ────────────────
        indicators_for_prompt = {
            "_current_price": current_price,
            "rsi": {
                "value": round(rsi, 2) if rsi is not None else None,
                "signal": "oversold" if rsi is not None and rsi < 30 else "overbought" if rsi is not None and rsi > 70 else "neutral",
            },
            "macd": {
                "trend": macd_data["trend"] if macd_data else "neutral",
                "histogram": round(macd_data["histogram"], 4) if macd_data else None,
            },
            "bollinger_bands": {
                "position": bb_data["position"] if bb_data else "neutral",
            },
            "moving_averages": {
                "sma_20": round(ma_data["sma_20"], 2) if ma_data["sma_20"] is not None else None,
                "sma_50": round(ma_data["sma_50"], 2) if ma_data["sma_50"] is not None else None,
                "sma_200": round(ma_data["sma_200"], 2) if ma_data["sma_200"] is not None else None,
            },
            "stochastic": _strip_history(advanced.get("stochastic")),
            "adx": _strip_history(advanced.get("adx")),
        }

        ai_summary = await analyze_stock(
            ticker=ticker.upper(),
            summary=summary,
            indicators=indicators_for_prompt,
        )

        # Record usage (shared ai_analysis pool)
        db.add(FeatureUsage(user_id=current_user.id, feature="ai_analysis"))
        await db.commit()

        return {
            "summary": ai_summary,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not generate AI analysis for {ticker.upper()}: {_safe_error(e)}",
        )


async def _fetch_forecast_inputs(ticker: str, current_price: float) -> dict:
    """
    FMP's DCF value and the analyst price targets, for the AI target. Each is None
    on failure, and also when valuation_check.vendor_per_share_ok rejects it: FMP
    doesn't convert these and their basis varies by company, so a foreign
    reporter's or an implausible one must not anchor the forecast.
    """
    sym = ticker.upper()
    result = {
        "dcf_value": None,
        "analyst_consensus": None,
        "analyst_low": None,
        "analyst_high": None,
    }
    dcf_data, targets_data, ccy = await asyncio.gather(
        market_data_service._fmp_get("discounted-cash-flow", {"symbol": sym}),
        market_data_service._fmp_get("price-target-consensus", {"symbol": sym}),
        get_reporting_currency(sym),
        return_exceptions=True,
    )
    if isinstance(ccy, BaseException):
        ccy = None

    if isinstance(dcf_data, list) and dcf_data and isinstance(dcf_data[0], dict):
        dcf = dcf_data[0].get("dcf")
        if vendor_per_share_ok(dcf, current_price, ccy):
            result["dcf_value"] = dcf

    if isinstance(targets_data, list) and targets_data and isinstance(targets_data[0], dict):
        t = targets_data[0]
        if vendor_per_share_ok(t.get("targetConsensus"), current_price, ccy):
            result["analyst_consensus"] = t.get("targetConsensus")
            result["analyst_low"] = t.get("targetLow")
            result["analyst_high"] = t.get("targetHigh")

    failed = [n for n, r in (("dcf", dcf_data), ("targets", targets_data)) if isinstance(r, BaseException)]
    if failed:
        print(f"⚠️ Forecast input fetch failed for {ticker}: {', '.join(failed)}")
    return result


@router.get("/stocks/{ticker}/price-forecast")
async def stock_price_forecast(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a 3-month bear/base/bull price forecast by triangulating DCF intrinsic value,
    technical support/resistance range, and analyst consensus target via Claude.

    Metered like /ai-financials: plans without AI analysis get 403; a forecast
    cached in the last 6 hours (per ticker, any user) is free; generating a new
    one uses one ai_analysis from the shared allowance. The frontend asks only on
    an explicit click.
    """
    sym = ticker.upper()

    # Tier gate first, so a plan without AI can't read a forecast another user paid for
    _require_ai_tier(current_user)

    # ── Serve from cache if fresh ─────────────────────────────────────────
    cached = _forecast_cache.get(sym)
    if cached is not None:
        ts, payload = cached
        if time.time() - ts < _FORECAST_TTL:
            return payload

    await check_ai_analysis_access(current_user, db)

    try:
        # ── Fetch historical prices for technical analysis ────────────────
        historical = await market_data_service.get_historical_prices(sym, INDICATOR_HISTORY_DAYS)
        if not historical or len(historical) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No historical data available for {sym}",
            )

        prices = [float(day["close"]) for day in historical]
        highs = [float(day["high"]) for day in historical]
        lows = [float(day["low"]) for day in historical]
        volumes = [float(day["volume"]) for day in historical]
        current_price = prices[-1]

        # ── Fetch DCF + analyst targets from FMP in parallel ─────────────
        fmp_inputs = await _fetch_forecast_inputs(sym, current_price)

        # ── Compute advanced technical indicators (synchronous) ───────────
        advanced = {}
        try:
            advanced = technical_indicators.calculate_all_advanced(highs, lows, prices, volumes)
        except Exception:
            # Our own calc, not a vendor call — a failure here is a bug; keep the traceback
            logger.exception("Advanced indicators failed for %s", sym)

        # ── Compute summary indicators (support/resistance + score) ───────
        # The same calls /technical-analysis/analyze makes, so the forecast's
        # technical range and score are the ones the page shows.
        summary = generate_summary(
            technical_indicators.calculate_rsi(prices),
            technical_indicators.calculate_macd(prices),
            technical_indicators.calculate_moving_averages(prices),
            technical_indicators.calculate_bollinger_bands(prices),
            current_price,
            advanced if isinstance(advanced, dict) else {},
        )

        price_range = summary.get("price_range")
        tech_support = price_range.get("support") if price_range else None
        tech_resistance = price_range.get("resistance") if price_range else None
        tech_score = summary.get("score")
        tech_outlook = summary.get("outlook")

        # ── Call Claude ───────────────────────────────────────────────────
        forecast = await forecast_stock_price(
            ticker=sym,
            current_price=current_price,
            analyst_consensus=fmp_inputs.get("analyst_consensus"),
            analyst_low=fmp_inputs.get("analyst_low"),
            analyst_high=fmp_inputs.get("analyst_high"),
            dcf_value=fmp_inputs.get("dcf_value"),
            tech_support=tech_support,
            tech_resistance=tech_resistance,
            tech_score=tech_score,
            tech_outlook=tech_outlook,
        )

        if forecast is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to generate price forecast at this time.",
            )

        # ── Build and cache response ──────────────────────────────────────
        result = {
            "ticker": sym,
            "bear": forecast["bear"],
            "base": forecast["base"],
            "bull": forecast["bull"],
            "horizon": "3 months",
            "rationale": forecast["rationale"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        _forecast_cache[sym] = (time.time(), result)

        # Record usage (shared ai_analysis pool) only once a forecast exists
        db.add(FeatureUsage(user_id=current_user.id, feature="ai_analysis"))
        await db.commit()

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not generate price forecast for {sym}: {_safe_error(e)}",
        )


def _require_ai_tier(user: User) -> None:
    """Tier eligibility only — no usage counting, no DB read.

    Split out from check_ai_analysis_access so it can run *before* the cache read.
    Otherwise a tier with no AI entitlement could read a summary another user had
    already paid to generate. The quota count still runs after the cache check, on
    a miss only, so a paying user who is out of uses can still see a cached read.
    """
    if get_tier_limit(user.subscription_tier, "ai_analysis") == 0:
        next_tier = get_upgrade_tier(user.subscription_tier)
        upgrade = (
            f" Upgrade to {next_tier.capitalize()} to unlock AI analysis."
            if next_tier else ""
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"AI analysis is not available on the "
                f"{user.subscription_tier.capitalize()} plan.{upgrade}"
            ),
        )


def _financials_ai_response(
    sym: str,
    summary: str | None,
    suppression_reason: str | None,
    generated_at: str,
    cached: bool = False,
) -> dict:
    """Uniform payload. Suppression is a normal outcome, not an error, so it comes
    back as HTTP 200 with summary=None — the frontend renders nothing and needs no
    status-code switch."""
    return {
        "ticker": sym,
        "summary": summary,
        "generated_at": generated_at,
        "suppressed": summary is None,
        "suppression_reason": suppression_reason,
        "cached": cached,
    }


@router.get("/stocks/{ticker}/ai-financials")
async def stock_ai_financials(
    ticker: str,
    refresh: bool = Query(False, description="Bypass the 24h cache and regenerate."),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI plain-language read of a company's financial statements.

    Not a valuation call, not a recommendation, and not a restatement of the ratio
    cards — see app/services/financial_analyzer.py for the enforced constraints.

    Every suppression check runs before both the Claude call and the FeatureUsage
    write: a user must never spend quota to be told this isn't available for ETFs.
    """
    sym = ticker.strip().upper()
    if not sym or len(sym) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ticker symbol",
        )

    # Tier gate first, so an unentitled plan cannot read a cached summary.
    _require_ai_tier(current_user)

    # ── Serve from cache ─────────────────────────────────────────────────
    # A cache hit costs the user nothing: no Claude call, no usage row. Whoever
    # pays the quota on a cold ticker funds free reads for the next 24 hours.
    # Same economics as /price-forecast, and it errs toward the user.
    if not refresh:
        entry = _financials_ai_cache.get(sym)
        if entry is not None:
            ts, payload = entry
            ttl = _FINANCIALS_AI_TTL if payload.get("summary") else _FINANCIALS_AI_SUPPRESSED_TTL
            if time.time() - ts < ttl:
                return {**payload, "cached": True}

    await check_ai_analysis_access(current_user, db)

    generated_at = datetime.now(timezone.utc).isoformat()

    def suppress(reason: str) -> dict:
        payload = _financials_ai_response(sym, None, reason, generated_at)
        _financials_ai_cache[sym] = (time.time(), payload)
        return payload

    # ── Suppression: security type ───────────────────────────────────────
    # API-driven, not the ticker-suffix heuristic — suffix matching has false
    # positives on legitimate tickers. A failed profile lookup is not treated as
    # a suppression signal; the no_data check below catches those tickers anyway.
    try:
        company = await market_data_service.get_company_info(sym)
    except Exception:
        company = {}
    if (company.get("type") or "").upper() in UNSUITABLE_SECURITY_TYPES:
        return suppress("unsuitable_security_type")

    # ── Load financials ──────────────────────────────────────────────────
    try:
        financials = await get_company_financials(sym, include_raw=True)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not load financials for {sym}: {_safe_error(e)}",
        )

    # A statement that failed to load is an error to retry, never a "no_data"
    # suppression: that would be cached for an hour and read as "nothing to say".
    if financials.get("unavailable"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Financial data for {sym} is temporarily unavailable. Please try again shortly.",
        )

    entity_trust = financials.get("entity_trust") or {}
    growth = financials.get("growth_profile") or {}
    income = financials.get("income_statement") or {}
    balance = financials.get("balance_sheet") or {}
    raw = financials.get("_raw") or {}
    quarters_available = len(raw.get("income_quarters") or [])

    # ── Suppression: wrong entity ────────────────────────────────────────
    # Checked before the no_data test below. The financials service already
    # blanks the payload on a contradiction, so without this the read would
    # suppress as "no_data" and tell the user their ticker has no financials —
    # when the truth is that the vendor has someone else's.
    if is_contradicted(entity_trust):
        logger.info(
            "Financials read for %s suppressed: entity contradiction (%s)",
            sym, entity_trust.get("basis"),
        )
        return suppress("wrong_entity")

    # growth_profile is None when there is no revenue history at all.
    if not financials.get("growth_profile") or (
        income.get("revenue") is None and balance.get("total_assets") is None
    ):
        return suppress("no_data")

    # CIK mismatch (ticker reused by a different entity) or filings older than
    # ~9 months. A narrative built on another company's filings is the worst
    # output this feature could produce.
    if growth.get("is_stale"):
        logger.info(
            "Financials read for %s suppressed: stale (%s)", sym, growth.get("stale_reason")
        )
        return suppress("stale_financials")

    if quarters_available < MIN_QUARTERS:
        return suppress("insufficient_history")

    # ── Suppression: bankruptcy ──────────────────────────────────────────
    # The Stock Details page already explains the situation authoritatively with
    # the filing date and an EDGAR link; a second AI paraphrase adds nothing and
    # could contradict it.
    # EDGAR's own CIK for the ticker, not the vendor's guess at it — this is a
    # real EDGAR query, and feeding it a vendor CIK meant that whenever the
    # vendor's identity was wrong we checked the wrong company's filings.
    bankruptcy = await detect_bankruptcy(entity_trust.get("edgar_cik"))
    if bankruptcy and bankruptcy.get("detected"):
        return suppress("bankruptcy")

    # ── Build the fact block ─────────────────────────────────────────────
    fact_block = build_fact_block(financials)
    if not fact_block.notable:
        logger.info("Financials read for %s suppressed: nothing notable", sym)
        return suppress("nothing_notable")

    summary = await analyze_financials(sym, fact_block.text)

    if summary is None:
        # Never cached and never metered — a timeout must not lock a ticker out
        # for 24 hours or cost the user a use.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to generate a financials read at this time. Please try again.",
        )

    if summary == NOTHING_NOTABLE:
        return suppress("nothing_notable")

    # ── Numeral validation — log only (see financial_fact_block §4.2) ─────
    untraceable = find_unsupported_numerals(summary, fact_block.numeral_allowlist)
    if untraceable:
        logger.warning(
            "Financials read for %s cited untraceable numerals %s | reasons=%s | summary=%r",
            sym, untraceable, fact_block.reasons, summary,
        )

    db.add(FeatureUsage(user_id=current_user.id, feature="ai_analysis"))
    await db.commit()

    payload = _financials_ai_response(sym, summary, None, generated_at)
    _financials_ai_cache[sym] = (time.time(), payload)
    return payload
