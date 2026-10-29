"""
Valuation cross-check — does a vendor P/E agree with the company's own earnings?

One rule for every surface that shows FMP's ratios-ttm multiples. The screener's
valuation pass (tasks/refresh_stock_snapshots) stores them through it, and
financials_service serves them through it, so a figure the screener refuses is never
shown on a company page, in the DCF or in Relative Valuation either.

FMP's P/E is compared with one computed independently: market cap in dollars over TTM
net income, converted from the reporting currency at the day's rate. A row that
disagrees was computed on the wrong basis (unconverted currency, ADR share ratio,
wrong earnings), and the other price multiples on it share that basis, so the caller
withholds all of them. Suppress, don't caveat: a wrong 2.1 looks like a bargain.

Exchange rates come from services/fx. Pure logic, importable with no config:
    python -m app.services.valuation_check --selftest
"""
from __future__ import annotations

import math

# ratios-ttm is used only when its P/E agrees within this factor with one computed
# independently: market cap (USD) over TTM net income (in the reporting currency)
# converted at today's rate. Measured 2026-10-25 over 2,950 stocks where both exist:
# 93% of USD reporters and 87% of foreign reporters agree within 1.5x, and the >2x tail
# was FMP's error, not ours: Sabesp reported a P/E of 2.1 against 15 because FMP divided
# a dollar price by earnings in reais; Biogen 1.7 against 106; HCA 58 against 15; TAL
# 2.1 against 6.8. The screener's floors cannot catch these, since a wrong 2.1 looks
# like a bargain. 2x sits past the agreeing mass and below the smallest currency miss
# that matters.
_VALUATION_CHECK_TOLERANCE = 2.0
# A reporting currency within this factor of the dollar (EUR, GBP, CAD, CHF, AUD, SGD)
# cannot be told apart from an unconverted one by a 2x check, and an unconverted figure
# there is at most ~40% off. Beyond it (BRL, CNY, JPY, KRW, INR, ARS) a multiple that
# could not be checked is not used: an unconverted one would be 5x to 1,500x off.
_FAR_FX = 2.0


def valuation_check(fmp_pe, market_cap, net_income, currency, fx: dict[str, float]) -> str:
    """Whether a ratios-ttm row may be used: "ok", "mismatch" or "unverifiable".

    Anything but "ok" withholds the row's price multiples. `market_cap` must be in
    dollars (batch-quote or profile, never key-metrics-ttm, which is in the reporting
    currency for foreign filers). See _VALUATION_CHECK_TOLERANCE for the measurements
    behind the rule.

    - Both P/E and TTM net income positive: compare FMP's P/E with market cap x rate /
      net income. Within tolerance is "ok", outside is "mismatch".
    - Exactly one positive: FMP and the statement disagree on whether the company made
      money. "mismatch".
    - Both non-positive (a loss-maker): there is no P/E to check. "ok" for a reporting
      currency near the dollar, "unverifiable" for one far from it (see _FAR_FX).
    - No statement, no currency, no rate, or no market cap: "unverifiable". On the
      2026-10-25 universe the 20 such rows carrying a P/E were SPACs, notes and
      micro-caps, one at a P/E of 0.4.
    """
    def _pos(x) -> float | None:
        try:
            v = float(x)
        except (TypeError, ValueError):
            return None
        return v if math.isfinite(v) and v > 0 else None

    def _num(x) -> float | None:
        try:
            v = float(x)
        except (TypeError, ValueError):
            return None
        return v if math.isfinite(v) else None

    ccy = (currency or "").upper()
    rate = fx.get(ccy) if ccy else None
    ni = _num(net_income)
    if not ccy or rate is None or ni is None:
        return "unverifiable"

    pe, profit = _pos(fmp_pe), ni > 0
    if pe is None and not profit:
        return "unverifiable" if abs(math.log(rate)) >= math.log(_FAR_FX) else "ok"
    if (pe is None) != (not profit):
        return "mismatch"

    mcap = _pos(market_cap)
    if mcap is None:
        return "unverifiable"
    independent = mcap * rate / ni
    return "ok" if abs(math.log(pe / independent)) <= math.log(_VALUATION_CHECK_TOLERANCE) else "mismatch"


def check_against_quarters(fmp_pe, market_cap, quarters, fx: dict[str, float]) -> str:
    """valuation_check with TTM earnings summed from quarterly income-statement rows
    (newest first), for callers that already hold those rather than income-statement-ttm.

    Needs the full four quarters: a partial sum understates earnings and could fail a
    correct P/E, so fewer is "unverifiable". Currency is the latest quarter's.
    """
    rows = [q for q in (quarters if isinstance(quarters, list) else [])[:4] if isinstance(q, dict)]
    incomes = [q.get("netIncome") for q in rows if q.get("netIncome") is not None]
    return valuation_check(
        fmp_pe,
        market_cap,
        sum(incomes) if len(incomes) == 4 else None,
        rows[0].get("reportedCurrency") if rows else None,
        fx,
    )


def _selftest() -> None:
    from app.services.fx import fx_per_usd

    fx = fx_per_usd([
        {"symbol": "USDBRL", "price": 5.42}, {"symbol": "EURUSD", "price": 1.16},
        {"symbol": "USDJPY", "price": 157.9}, {"symbol": "USDCNY", "price": 6.65},
    ])
    # valuation_check, figures from the 2026-10-25 measurement
    assert valuation_check(39.74, 5.075e12, 1.2771e11, "USD", fx) == "ok"                 # AAPL
    assert valuation_check(2.14, 21.9e9, 7.874e9, "BRL", fx) == "mismatch"                # SBS, reais left unconverted
    assert valuation_check(15.06, 21.9e9, 7.874e9, "BRL", fx) == "ok"                     # SBS, what a correct row looks like
    assert valuation_check(8.84, 233e9, 233e9 * 157.9 / 8.84, "JPY", fx) == "ok"          # TM, converted
    assert valuation_check(1.67, 37.0e9, 37.0e9 / 106.44, "USD", fx) == "mismatch"        # BIIB
    assert valuation_check(10, 5e9, -1e9, "USD", fx) == "mismatch"                        # profit vs loss
    assert valuation_check(-12, 5e9, 1e9, "USD", fx) == "mismatch"                        # loss vs profit
    assert valuation_check(None, 5e9, -1e9, "EUR", fx) == "ok"                            # loss-maker, near FX
    assert valuation_check(None, 5e9, -1e9, "CNY", fx) == "unverifiable"                  # loss-maker, far FX
    assert valuation_check(25, 5e9, None, None, fx) == "unverifiable"                     # no statement
    assert valuation_check(25, 5e9, 2e8, "ZZZ", fx) == "unverifiable"                     # no rate
    assert valuation_check(25, None, 2e8, "USD", fx) == "unverifiable"                    # no market cap
    assert valuation_check(30, 5e9, 2e8, "USD", fx) == "ok"                               # 30 vs 25, inside 2x
    assert valuation_check(60, 5e9, 2e8, "USD", fx) == "mismatch"                         # 60 vs 25, outside 2x
    # TM's key-metrics-ttm market cap is in yen (36.4T on 2026-10-29): passed by
    # mistake it fails a correct row, which is why callers must pass a dollar figure.
    assert valuation_check(8.76, 36.44e12, 4.541e12, "JPY", fx) == "mismatch"
    # Rates unavailable: dollar reporters still checked, foreign ones withheld.
    usd_only = fx_per_usd([])
    assert valuation_check(39.74, 5.075e12, 1.2771e11, "USD", usd_only) == "ok"
    assert valuation_check(8.84, 233e9, 233e9 * 157.9 / 8.84, "JPY", usd_only) == "unverifiable"
    # check_against_quarters: four quarters summed, latest currency, fewer is unverifiable
    q = [{"netIncome": 1.2771e11 / 4, "reportedCurrency": "USD"}] * 4
    assert check_against_quarters(39.74, 5.075e12, q, fx) == "ok"                          # AAPL
    assert check_against_quarters(39.74, 5.075e12, q + [{"netIncome": 1e15}], fx) == "ok"  # 5th quarter ignored
    assert check_against_quarters(39.74, 5.075e12, q[:3], fx) == "unverifiable"            # IPO, 3 quarters
    assert check_against_quarters(39.74, 5.075e12, q[:3] + [{"netIncome": None}], fx) == "unverifiable"
    assert check_against_quarters(1.67, 37.0e9, [{"netIncome": 347.989e6 / 4, "reportedCurrency": "USD"}] * 4, fx) == "mismatch"  # BIIB
    assert check_against_quarters(25, 5e9, None, fx) == "unverifiable"
    assert check_against_quarters(25, 5e9, "garbage", fx) == "unverifiable"
    print("valuation_check selftest OK")


if __name__ == "__main__":
    import sys

    if "--selftest" in sys.argv[1:]:
        _selftest()
    else:
        print("usage: python -m app.services.valuation_check --selftest")
