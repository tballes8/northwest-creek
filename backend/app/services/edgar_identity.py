"""
Entity identity via SEC EDGAR — the single upstream answer to "does this
ticker's data actually belong to the entity this ticker identifies?"

Why this exists
---------------
A ticker is a mutable label, not an identity. Vendors key on the label, so the
label can lie in two confirmed ways:

- **Cross-exchange collision**: the same symbol trades on two exchanges and
  vendor data mixes them.
- **Cross-time reuse**: a defunct company's ticker is reassigned to a new
  entity. TE is the worked example — SEC resolves TE to CIK 1992243 (T1 Energy
  Inc.), while FMP was serving financials filed under CIK 1844224, the prior
  entity that used the symbol.

**CIK is the identity.** EDGAR is CIK-native and is therefore the authority on
which entity a ticker points to *right now*. A vendor's own notion of entity
identity is a claim to be verified, never the authority.

Tri-state, not boolean
----------------------
Only a *positive contradiction* blocks. Failing to resolve is not a
contradiction — funds/ETFs are absent from `company_tickers.json` entirely
(they live in the mutual-fund file, keyed by series/class), and brand-new
registrants lag the file. Hard-blocking on non-resolution would false-suppress
legitimate tickers, so `cannot_resolve` proceeds with existing behavior.

Cost
----
After the first cached load, resolution is an in-memory dict lookup. The map is
fetched once per process per `_TICKER_MAP_TTL_SECONDS` and shared across
callers. There is no per-ticker network call.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"

# company_tickers.json changes slowly (new registrants, symbol changes).
_TICKER_MAP_TTL_SECONDS = 24 * 3600

# Module-level cache: one map, one TTL, shared by every caller in the process.
_ticker_map_cache: dict[str, tuple[int, str | None]] = {}
_ticker_map_fetched_at: float = 0.0
_ticker_map_lock = asyncio.Lock()

# Verdicts
MATCH = "match"
CONTRADICTION = "contradiction"
CANNOT_RESOLVE = "cannot_resolve"

# How a verdict was reached — worth surfacing, because an EDGAR-backed
# contradiction is a much stronger claim than a vendor contradicting itself.
BASIS_EDGAR = "edgar_vs_filing"
BASIS_FMP_INTERNAL = "fmp_internal"
BASIS_UNRESOLVED = "unresolved"


def normalize_cik(value: Any) -> Optional[int]:
    """
    Coerce a CIK to int, or None if it isn't one.

    Vendors and EDGAR disagree on formatting: EDGAR's map holds ints, EDGAR URLs
    want 10-digit zero-padded, and FMP returns strings whose padding is not
    guaranteed consistent across endpoints. Comparing raw strings makes
    "0000320193" != "320193" — a false "wrong entity" verdict on a perfectly
    correct ticker. Normalize both sides before any comparison.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    try:
        cik = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return cik if cik > 0 else None


async def _ensure_ticker_map() -> None:
    # Imported here, not at module scope, so that the pure logic below
    # (normalize_cik, build_entity_trust) stays importable and testable with no
    # config, no .env and no HTTP dependency -- same discipline as
    # financial_fact_block. That logic is where the bugs live.
    from app.services.edgar_client import edgar_get

    global _ticker_map_cache, _ticker_map_fetched_at
    async with _ticker_map_lock:
        fresh = (time.time() - _ticker_map_fetched_at) < _TICKER_MAP_TTL_SECONDS
        if _ticker_map_cache and fresh:
            return
        resp = await edgar_get(_TICKER_MAP_URL)
        if resp.status_code == 404:  # not expected; treat as "no map available"
            return
        raw = resp.json()
        # Shape: {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ...}
        new_map: dict[str, tuple[int, str | None]] = {}
        for entry in raw.values():
            tkr = str(entry.get("ticker", "")).upper().strip()
            cik = normalize_cik(entry.get("cik_str"))
            if tkr and cik:
                new_map[tkr] = (cik, entry.get("title"))
        if new_map:
            _ticker_map_cache = new_map
            _ticker_map_fetched_at = time.time()


async def resolve_ticker_cik(ticker: str) -> Optional[tuple[int, str | None]]:
    """
    Resolve a ticker to its current (CIK, company name) per SEC EDGAR.

    Returns None when the ticker is not in `company_tickers.json` — a fund/ETF,
    a non-US filer, a delisted symbol, or a registrant the file hasn't caught up
    to. **Non-resolution is a normal data condition and returns None rather than
    raising**: this runs inside request handling, where an exception would
    become a 500 for what is really "identity not verifiable here".
    """
    if not ticker:
        return None
    try:
        await _ensure_ticker_map()
    except Exception as e:
        # EDGAR unreachable, throttled out, or misconfigured UA. Degrade to
        # cannot_resolve — never fail the financials request over it.
        print(f"WARN: EDGAR ticker map unavailable ({type(e).__name__}: {e})")
        return None
    return _ticker_map_cache.get(ticker.upper().strip())


async def warm_ticker_map() -> None:
    """Preload the map at startup so no user request pays the first fetch."""
    try:
        await _ensure_ticker_map()
        print(f"SEC EDGAR ticker map warmed ({len(_ticker_map_cache)} tickers)")
    except Exception as e:
        print(f"WARN: EDGAR ticker map warm failed ({type(e).__name__}: {e})")


def build_entity_trust(
    ticker: str,
    edgar: Optional[tuple[int, str | None]],
    fmp_filing_cik: Any,
    fmp_profile_cik: Any,
) -> dict:
    """
    Compare EDGAR's identity for `ticker` against the CIK(s) the vendor stamped
    on the data, and return the single verdict every downstream surface gates on.

    `fmp_filing_cik` (the CIK on the income-statement rows) is preferred over
    `fmp_profile_cik` because it is stamped on the actual numbers being
    rendered, not on the ticker's metadata.

    The ladder:
      1. EDGAR and a vendor CIK both present -> match / contradiction.
      2. EDGAR absent but the vendor's own two CIKs disagree -> contradiction.
         This preserves the pre-existing vendor-vs-vendor check; without it,
         funds and lagging registrants would silently lose the only check they
         have today.
      3. Otherwise -> cannot_resolve. Never blocks on identity grounds.
    """
    edgar_cik = normalize_cik(edgar[0]) if edgar else None
    edgar_name = edgar[1] if edgar else None
    filing_cik = normalize_cik(fmp_filing_cik)
    profile_cik = normalize_cik(fmp_profile_cik)

    verdict = CANNOT_RESOLVE
    basis = BASIS_UNRESOLVED
    message = None

    symbol = (ticker or "").upper()
    vendor_cik = filing_cik or profile_cik

    if edgar_cik and vendor_cik:
        basis = BASIS_EDGAR
        if edgar_cik == vendor_cik:
            verdict = MATCH
        else:
            verdict = CONTRADICTION
            named = f" ({edgar_name})" if edgar_name else ""
            # Deliberately silent on whether the current entity has filings —
            # we never queried them. Claiming "no filings available" here would
            # be false for the motivating case (T1 Energy files normally), and
            # it turns a fixable vendor mapping error into an apparent dead end.
            message = (
                f"Vendor data for {symbol} is filed under CIK {vendor_cik}, but "
                f"{symbol} currently identifies CIK {edgar_cik}{named} per SEC "
                f"EDGAR. These figures belong to a different company and have "
                f"been suppressed."
            )
    elif not edgar_cik and filing_cik and profile_cik and filing_cik != profile_cik:
        verdict = CONTRADICTION
        basis = BASIS_FMP_INTERNAL
        message = (
            f"Vendor data for {symbol} is internally inconsistent: the financial "
            f"statements are filed under CIK {filing_cik} while the company "
            f"profile reports CIK {profile_cik}. These figures may belong to a "
            f"different company and have been suppressed."
        )

    return {
        "verdict": verdict,
        "edgar_cik": edgar_cik,
        "edgar_company_name": edgar_name,
        "fmp_filing_cik": filing_cik,
        "fmp_profile_cik": profile_cik,
        "basis": basis,
        "message": message,
    }


def is_contradicted(entity_trust: Optional[dict]) -> bool:
    """True only on a positive contradiction. The one thing that blocks."""
    return bool(entity_trust) and entity_trust.get("verdict") == CONTRADICTION


# -- Self-test / CLI ---------------------------------------------------------
# This repo has no pytest infrastructure; the convention is an offline assert
# block runnable from the module itself. Offline covers the pure logic (which is
# where the bugs are); --check hits live EDGAR.
#
#   python -m app.services.edgar_identity --selftest
#   python -m app.services.edgar_identity --check TE ULTY HMR AAPL
def _selftest() -> int:
    # normalize_cik: the formats FMP and EDGAR actually produce
    assert normalize_cik("0000320193") == 320193
    assert normalize_cik("320193") == 320193
    assert normalize_cik(320193) == 320193
    assert normalize_cik("  320193 ") == 320193
    assert normalize_cik(None) is None
    assert normalize_cik("") is None
    assert normalize_cik("N/A") is None
    assert normalize_cik(0) is None
    assert normalize_cik(True) is None, "bool is not a CIK"

    # REGRESSION: the pre-existing defect. The old check compared raw strings,
    # so a correct ticker whose two CIKs were padded differently rendered a
    # "Wrong Entity" banner. This must be a match.
    t = build_entity_trust("AAPL", (320193, "Apple Inc."), "0000320193", "320193")
    assert t["verdict"] == MATCH, t
    assert t["basis"] == BASIS_EDGAR
    assert t["message"] is None
    assert not is_contradicted(t)

    # TE: EDGAR-backed contradiction (the motivating case)
    t = build_entity_trust("TE", (1992243, "T1 Energy Inc."), "1844224", "1844224")
    assert t["verdict"] == CONTRADICTION, t
    assert t["basis"] == BASIS_EDGAR
    assert t["edgar_cik"] == 1992243 and t["fmp_filing_cik"] == 1844224
    assert is_contradicted(t)
    assert "T1 Energy Inc." in t["message"]
    # Must not resurrect the false claim the old copy made.
    low = t["message"].lower()
    assert "no sec filings" not in low and "no filings" not in low, t["message"]

    # Filing CIK wins over profile CIK — it is stamped on the rendered numbers.
    t = build_entity_trust("TE", (1992243, "T1 Energy Inc."), "1844224", "1992243")
    assert t["verdict"] == CONTRADICTION, t
    assert t["fmp_filing_cik"] == 1844224

    # Profile CIK is the fallback when the filing rows carry no CIK.
    t = build_entity_trust("AAPL", (320193, "Apple Inc."), None, "320193")
    assert t["verdict"] == MATCH, t

    # Fund/unlisted: EDGAR can't resolve and the vendor agrees with itself.
    t = build_entity_trust("ULTY", None, "1234567", "1234567")
    assert t["verdict"] == CANNOT_RESOLVE, t
    assert t["basis"] == BASIS_UNRESOLVED
    assert not is_contradicted(t), "cannot_resolve must never block"

    # Nothing resolvable at all.
    t = build_entity_trust("ZZZZ", None, None, None)
    assert t["verdict"] == CANNOT_RESOLVE, t

    # EDGAR absent, but the vendor contradicts itself — preserves the check the
    # codebase had before this gate existed.
    t = build_entity_trust("XYZ", None, "1844224", "1992243")
    assert t["verdict"] == CONTRADICTION, t
    assert t["basis"] == BASIS_FMP_INTERNAL
    assert is_contradicted(t)

    # EDGAR present but no vendor CIK anywhere: not verifiable, not a block.
    t = build_entity_trust("NEWCO", (9999999, "New Co"), None, None)
    assert t["verdict"] == CANNOT_RESOLVE, t

    print("selftest OK - normalize_cik, verdict ladder, padding regression, messaging")
    return 0


async def _check(tickers: list[str]) -> int:
    for tkr in tickers:
        resolved = await resolve_ticker_cik(tkr)
        if resolved:
            print(f"{tkr:6} -> EDGAR CIK {resolved[0]} ({resolved[1]})")
        else:
            print(f"{tkr:6} -> not in company_tickers.json (cannot_resolve)")
    return 0


def _main(argv: list[str]) -> int:
    import asyncio as _aio
    if len(argv) < 2:
        print("usage: python -m app.services.edgar_identity --selftest | --check TICKER...")
        return 2
    if argv[1] == "--selftest":
        return _selftest()
    if argv[1] == "--check":
        return _aio.run(_check(argv[2:] or ["TE", "ULTY", "HMR", "AAPL"]))
    print(f"unknown option {argv[1]!r}")
    return 2


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv))
