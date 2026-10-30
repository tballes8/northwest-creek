"""
US-dollar conversion — the one place exchange rates are fetched and applied.

FMP's statements, key metrics and analyst estimates come in the currency the company
reports in: yen for Toyota, Taiwan dollars for TSM, reais for Sabesp. Prices, market
caps and the screener are in dollars. The app shows everything in dollars, so
reporting-currency figures are converted here before anything reads them.

Rates are units of the currency per US dollar (USDJPY 157.9), so dollars = value / rate.
Today's rate converts every period alike, which keeps growth and margins exactly as
the company reports them; a per-quarter rate would show the yen's slide as falling
sales. Historical rates are only for figures set against a dollar price on their own
date — the quarterly trailing P/E.

Shares are not converted: FMP reports ADR issuers' share counts and EPS per
depositary share (Toyota's 1.30B diluted shares match its dollar market cap over the
ADR price), so converting EPS by the rate alone gives dollars per traded share.

Pure logic (fx_per_usd, usd_rate, to_usd, rows_to_usd, rate_on) imports with no config:
    python -m app.services.fx --selftest
"""
from __future__ import annotations

import asyncio
import math
import time
from datetime import date, datetime, timedelta

# Statement fields that are numeric but not money. Every other int/float field on an
# FMP income, balance-sheet or cash-flow row is a money amount (EPS is money per
# share), so it is converted; a field FMP adds later is converted too, which errs
# toward dollars rather than toward leaving a figure in yen.
_NON_MONEY_FIELDS = frozenset({
    "weightedAverageShsOut", "weightedAverageShsOutDil", "fiscalYear", "calendarYear",
})

# Rates for request-time callers, which serve one company per request and so cannot
# spend a forex call on each. The screener pass fetches its own once per run.
_FX_TTL_SECONDS = 6 * 3600
# A failed fetch is retried after this rather than the full TTL, but not on every
# request either: an outage would otherwise add a doomed FMP call to each one.
_FX_RETRY_SECONDS = 300
# Daily history per currency, for the quarterly P/E. Covers the 12-quarter window
# financials_service prices against, plus margin.
_FX_HISTORY_DAYS = 1300
_FX_HISTORY_TTL_SECONDS = 12 * 3600
# A company's reporting currency changes essentially never.
_CURRENCY_TTL_SECONDS = 24 * 3600
# Calendar days to walk back from a date to the last day a rate printed (weekends,
# holidays) — the same window financials_service uses for closing prices.
_WALK_BACK_DAYS = 7

_fx_cache: dict[str, float] = {"USD": 1.0}
_fx_fetched_at: float = 0.0
_fx_ok: bool = False
_fx_lock = asyncio.Lock()

_fx_history_cache: dict[str, tuple[float, dict[str, float]]] = {}
_fx_history_lock = asyncio.Lock()

_currency_cache: dict[str, tuple[float, str]] = {}


def fx_per_usd(quotes) -> dict[str, float]:
    """Units of each currency per US dollar, from /stable/batch-forex-quotes rows.

    USDxxx is read directly; a currency quoted only as xxxUSD is inverted. Rows without
    a positive price are ignored. USD itself is always 1.
    """
    direct: dict[str, float] = {}
    inverse: dict[str, float] = {}
    for q in quotes or []:
        if not isinstance(q, dict):
            continue
        sym = (q.get("symbol") or "").upper()
        try:
            price = float(q.get("price"))
        except (TypeError, ValueError):
            continue
        if len(sym) != 6 or not price > 0 or not math.isfinite(price):
            continue
        if sym.startswith("USD"):
            direct[sym[3:]] = price
        elif sym.endswith("USD"):
            inverse[sym[:3]] = 1.0 / price
    rates = {**inverse, **direct}
    rates["USD"] = 1.0
    return rates


def usd_rate(currency, fx: dict[str, float]) -> float | None:
    """Units of `currency` per dollar, or None when it is unknown or unpriced.

    No currency is unknown, not dollars. Analyst estimates carry no currency of
    their own, so when the reporting-currency lookup failed, defaulting to dollars
    showed Toyota's yen forward EPS as dollars (a 0.1x forward P/E). Statement rows
    are the one exception, in rows_to_usd.
    """
    ccy = (currency or "").upper()
    if not ccy:
        return None
    if ccy == "USD":
        return 1.0
    return fx.get(ccy)


def to_usd(value, rate: float | None):
    """`value` in dollars, or None when either is missing. Non-numbers pass through."""
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    if rate is None:
        return None
    return value / rate


def rows_to_usd(rows, fx: dict[str, float]) -> list[dict]:
    """Copies of FMP statement rows with every money field in dollars.

    Each row converts at the rate for its own `reportedCurrency`, then says "USD", so
    nothing downstream (the valuation check included) converts it twice. A row whose
    currency has no rate keeps its non-money fields and loses its money ones: a blank
    is shown, never an unconverted figure.
    """
    out: list[dict] = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        # FMP omits reportedCurrency only on rows with no statement behind them,
        # so here, and only here, a missing currency is taken as dollars.
        rate = usd_rate(row.get("reportedCurrency") or "USD", fx)
        converted = {
            k: v if k in _NON_MONEY_FIELDS else to_usd(v, rate)
            for k, v in row.items()
        }
        if row.get("reportedCurrency"):
            converted["reportedCurrency"] = "USD"
        out.append(converted)
    return out


def rate_on(history: dict[str, float], day: str | None) -> float | None:
    """The rate on `day` (YYYY-MM-DD), walking back over days with no print."""
    try:
        d = datetime.strptime(str(day)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None
    for _ in range(_WALK_BACK_DAYS):
        rate = history.get(d.isoformat())
        if rate is not None:
            return rate
        d -= timedelta(days=1)
    return None


async def get_fx_per_usd() -> dict[str, float]:
    """fx_per_usd from one cached batch-forex-quotes call, for request-time callers.

    Never raises. A failed refresh keeps the last good rates; with none ever fetched
    the map is {"USD": 1.0}, so dollar reporters work and every foreign one converts
    to blanks — withheld, never shown unconverted.
    """
    # Imported here so the pure logic above stays importable with no config, the
    # same discipline as edgar_identity.
    from app.services.market_data import market_data_service

    global _fx_cache, _fx_fetched_at, _fx_ok
    async with _fx_lock:
        ttl = _FX_TTL_SECONDS if _fx_ok else _FX_RETRY_SECONDS
        if time.time() - _fx_fetched_at < ttl:
            return _fx_cache
        try:
            rates = fx_per_usd(await market_data_service._fmp_get("batch-forex-quotes"))
        except Exception as e:
            print(f"WARN: batch-forex-quotes failed ({type(e).__name__}: {e})")
            rates = {}
        _fx_fetched_at = time.time()
        _fx_ok = len(rates) > 1
        if _fx_ok:
            _fx_cache = rates
        return _fx_cache


async def get_fx_history(currency: str) -> dict[str, float]:
    """Daily units of `currency` per dollar keyed by ISO date, cached per currency.

    {} on failure, so a caller converting at a historical date gets no rate and
    leaves that figure blank. Reads USDxxx, falling back to an inverted xxxUSD.
    """
    from app.services.market_data import market_data_service

    ccy = (currency or "").upper()
    if not ccy or ccy == "USD":
        return {}
    async with _fx_history_lock:
        hit = _fx_history_cache.get(ccy)
        if hit and time.time() - hit[0] < _FX_HISTORY_TTL_SECONDS:
            return hit[1]
        today = date.today()
        params = {"from": (today - timedelta(days=_FX_HISTORY_DAYS)).isoformat(), "to": today.isoformat()}
        history: dict[str, float] = {}
        for symbol, invert in ((f"USD{ccy}", False), (f"{ccy}USD", True)):
            try:
                rows = await market_data_service._fmp_get("historical-price-eod/full", {"symbol": symbol, **params})
            except Exception as e:
                print(f"WARN: FX history {symbol} failed ({type(e).__name__}: {e})")
                continue
            for r in rows if isinstance(rows, list) else []:
                try:
                    close = float(r.get("close"))
                except (TypeError, ValueError, AttributeError):
                    continue
                if r.get("date") and close > 0 and math.isfinite(close):
                    history[str(r["date"])[:10]] = 1.0 / close if invert else close
            if history:
                break
        if history:
            _fx_history_cache[ccy] = (time.time(), history)
        return history


async def get_reporting_currency(ticker: str) -> str | None:
    """The currency `ticker`'s statements are reported in, from its latest quarter.

    For callers that convert analyst estimates without a financials payload in hand —
    estimates carry no currency of their own, and analysts estimate in the company's
    reporting currency. None when it can't be read; only successes are cached.
    """
    from app.services.market_data import market_data_service

    sym = (ticker or "").upper().strip()
    hit = _currency_cache.get(sym)
    if hit and time.time() - hit[0] < _CURRENCY_TTL_SECONDS:
        return hit[1]
    try:
        rows = await market_data_service._fmp_get(
            "income-statement", {"symbol": sym, "period": "quarter", "limit": 1}
        )
    except Exception as e:
        print(f"WARN: reporting currency for {sym} unavailable ({type(e).__name__}: {e})")
        return None
    ccy = rows[0].get("reportedCurrency") if isinstance(rows, list) and rows and isinstance(rows[0], dict) else None
    if ccy:
        _currency_cache[sym] = (time.time(), ccy.upper())
    return ccy.upper() if ccy else None


def _selftest() -> None:
    # fx_per_usd: direct pairs win, inverse pairs fill gaps, junk is ignored
    fx = fx_per_usd([
        {"symbol": "USDBRL", "price": 5.42}, {"symbol": "EURUSD", "price": 1.16},
        {"symbol": "USDJPY", "price": 157.9}, {"symbol": "USDCNY", "price": 6.65},
        {"symbol": "BRLUSD", "price": 0.5}, {"symbol": "USDXXX", "price": 0}, {"symbol": "BAD"},
    ])
    assert fx["BRL"] == 5.42 and abs(fx["EUR"] - 1 / 1.16) < 1e-12 and fx["USD"] == 1.0 and "XXX" not in fx
    assert fx_per_usd(None) == {"USD": 1.0}

    # usd_rate / to_usd
    assert usd_rate("USD", fx) == 1.0 and usd_rate("jpy", fx) == 157.9
    assert usd_rate("ZZZ", fx) is None
    assert usd_rate(None, fx) is None and usd_rate("", fx) is None, "unknown is not dollars"
    assert to_usd(157.9e9, 157.9) == 1e9
    assert to_usd(None, 157.9) is None and to_usd(5, None) is None
    assert to_usd("2025", 157.9) == "2025" and to_usd(True, 157.9) is True

    # rows_to_usd: Toyota's real FY2026 Q2 shape (figures rounded)
    tm = [{
        "date": "2026-09-30", "reportedCurrency": "JPY", "cik": "0001094517", "fiscalYear": "2027",
        "period": "Q2", "revenue": 12.4e12, "netIncome": 1.18e12, "epsDiluted": 905.3,
        "weightedAverageShsOutDil": 1_303_327_400, "interestExpense": -4.1e10,
    }]
    usd = rows_to_usd(tm, fx)[0]
    assert abs(usd["revenue"] - 12.4e12 / 157.9) < 1 and abs(usd["epsDiluted"] - 905.3 / 157.9) < 1e-9
    assert usd["interestExpense"] < 0, "sign survives"
    assert usd["weightedAverageShsOutDil"] == 1_303_327_400, "share counts are not money"
    assert usd["cik"] == "0001094517" and usd["fiscalYear"] == "2027" and usd["date"] == "2026-09-30"
    assert usd["reportedCurrency"] == "USD", "converted rows must not be converted again"
    assert tm[0]["revenue"] == 12.4e12 and tm[0]["reportedCurrency"] == "JPY", "input untouched"
    # A dollar reporter passes through unchanged.
    aapl = {"reportedCurrency": "USD", "revenue": 4.67e11, "weightedAverageShsOutDil": 1.5e10}
    assert rows_to_usd([aapl], fx)[0] == aapl
    # No rate: money is withheld, never left in yen.
    blank = rows_to_usd([{**tm[0], "reportedCurrency": "ZZZ"}], fx)[0]
    assert blank["revenue"] is None and blank["epsDiluted"] is None
    assert blank["weightedAverageShsOutDil"] == 1_303_327_400 and blank["date"] == "2026-09-30"
    assert rows_to_usd(None, fx) == [] and rows_to_usd(["junk", tm[0]], fx)[0]["reportedCurrency"] == "USD"
    # A statement row with no currency is the one place that defaults to dollars.
    assert rows_to_usd([{"revenue": 5.0}], fx)[0] == {"revenue": 5.0}

    # rate_on: exact day, walk back over a weekend, give up past the window
    hist = {"2023-09-29": 149.322, "2023-10-02": 149.853}
    assert rate_on(hist, "2023-10-02") == 149.853
    assert rate_on(hist, "2023-10-01") == 149.322, "Sunday -> Friday"
    assert rate_on(hist, "2023-10-20") is None
    assert rate_on(hist, None) is None and rate_on({}, "2023-10-02") is None
    print("fx selftest OK")


if __name__ == "__main__":
    import sys

    if "--selftest" in sys.argv[1:]:
        _selftest()
    else:
        print("usage: python -m app.services.fx --selftest")
