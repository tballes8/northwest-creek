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
import re
import time
from typing import Any, Optional

_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
# Registered investment companies — ETFs, ETNs and mutual funds. A separate file
# because their identity unit is the series/class, not an operating registrant.
# Coverage across the two files is genuinely unpredictable: SPY, GLD, USO and
# QQQ appear in the operating file (they file 10-Ks as trusts or LPs), QQQ in
# BOTH, while ULTY, VOO, JEPI, ARKK, IWM and XLE appear only here. So neither
# file alone tells you whether a symbol is a fund.
_FUND_MAP_URL = "https://www.sec.gov/files/company_tickers_mf.json"

# company_tickers.json changes slowly (new registrants, symbol changes).
_TICKER_MAP_TTL_SECONDS = 24 * 3600

# Module-level cache: one map, one TTL, shared by every caller in the process.
_ticker_map_cache: dict[str, tuple[int, str | None]] = {}
_ticker_map_fetched_at: float = 0.0
_ticker_map_lock = asyncio.Lock()

# ticker -> (registrant CIK, seriesId, classId)
_fund_map_cache: dict[str, tuple[int, str, str]] = {}
_fund_map_fetched_at: float = 0.0
_fund_map_lock = asyncio.Lock()

# Verdicts
MATCH = "match"
CONTRADICTION = "contradiction"
CANNOT_RESOLVE = "cannot_resolve"
# A CIK mismatch where the vendor's CIK is the *predecessor registrant of the
# same business* — a reorganization, redomiciliation or reincorporation mints a
# new CIK for a company that never stopped operating. TE is the worked example:
# FREYR Battery (CIK 1844224, Luxembourg) redomesticated to Delaware as CIK
# 1992243 and renamed to T1 Energy. Successors routinely present predecessor
# financials, so this is NOT one company's numbers under another company's
# ticker and does not block. Data age is a separate axis — `date_stale` in
# financials_service covers "these figures predate the reorganization".
SUCCESSOR = "successor_registrant"

# How a verdict was reached — worth surfacing, because an EDGAR-backed
# contradiction is a much stronger claim than a vendor contradicting itself.
BASIS_EDGAR = "edgar_vs_filing"
BASIS_FMP_INTERNAL = "fmp_internal"
BASIS_UNRESOLVED = "unresolved"
BASIS_SUCCESSION = "edgar_name_lineage"
# The ticker is a registered fund. Identity is not verifiable the way it is for
# an operating company, and — critically — the vendor-vs-vendor fallback is NOT
# applied, because a fund's "entity CIK" on a financial statement is not a
# meaningful comparison against a trust/series registrant.
BASIS_FUND = "fund_registrant"

# Corporate-form suffixes stripped before comparing names. A redomiciliation
# changes exactly this part of the name ("FREYR Battery" -> "FREYR Battery,
# Inc. /DE/"), so leaving them in would hide the very lineage we are looking for.
_NAME_NOISE = (
    "incorporated", "corporation", "company", "limited", "holdings", "holding",
    "group", "inc", "corp", "co", "ltd", "llc", "lp", "plc", "sa", "nv", "ag",
    "ab", "as", "oyj", "spa", "the", "class", "common", "stock", "new",
)

# Filing types that mark a registrant as no longer reporting or no longer
# listed: Form 15 terminates a registration, Form 25 removes a listing.
_DEREGISTRATION_FORMS = ("15", "25")


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


async def _ensure_fund_map() -> None:
    global _fund_map_cache, _fund_map_fetched_at
    from app.services.edgar_client import edgar_get

    async with _fund_map_lock:
        fresh = (time.time() - _fund_map_fetched_at) < _TICKER_MAP_TTL_SECONDS
        if _fund_map_cache and fresh:
            return
        resp = await edgar_get(_FUND_MAP_URL)
        if resp.status_code == 404:
            return
        raw = resp.json()
        # Shape differs from the operating file: columnar, with a field list.
        # {"fields": ["cik","seriesId","classId","symbol"], "data": [[...], ...]}
        fields = raw.get("fields") or []
        rows = raw.get("data") or []
        try:
            idx = {name: i for i, name in enumerate(fields)}
            ci, si, cl, sy = idx["cik"], idx["seriesId"], idx["classId"], idx["symbol"]
        except KeyError:
            print(f"WARN: unexpected company_tickers_mf.json fields: {fields}")
            return
        new_map: dict[str, tuple[int, str, str]] = {}
        for row in rows:
            sym = str(row[sy]).upper().strip() if len(row) > sy else ""
            cik = normalize_cik(row[ci]) if len(row) > ci else None
            # First occurrence wins: a symbol maps to one class in practice.
            if sym and cik and sym not in new_map:
                new_map[sym] = (cik, row[si], row[cl])
        if new_map:
            _fund_map_cache = new_map
            _fund_map_fetched_at = time.time()


async def resolve_fund_ticker(ticker: str) -> Optional[tuple[int, str, str]]:
    """
    Resolve a ticker in SEC's registered-fund file.

    Returns (registrant CIK, seriesId, classId) or None. Used for *detection*,
    not comparison: the CIK here is the trust or fund-family registrant, so it
    is not a like-for-like counterpart to the entity CIK a vendor stamps on a
    financial statement. Knowing a symbol is a fund is what matters — it stops
    the vendor-vs-vendor fallback from hard-blocking an ETF page.
    """
    if not ticker:
        return None
    try:
        await _ensure_fund_map()
    except Exception as e:
        print(f"WARN: EDGAR fund map unavailable ({type(e).__name__}: {e})")
        return None
    return _fund_map_cache.get(ticker.upper().strip())


async def warm_ticker_map() -> None:
    """Preload both maps at startup so no user request pays the first fetch."""
    try:
        await _ensure_ticker_map()
        print(f"SEC EDGAR ticker map warmed ({len(_ticker_map_cache)} tickers)")
    except Exception as e:
        print(f"WARN: EDGAR ticker map warm failed ({type(e).__name__}: {e})")
    try:
        await _ensure_fund_map()
        print(f"SEC EDGAR fund map warmed ({len(_fund_map_cache)} tickers)")
    except Exception as e:
        print(f"WARN: EDGAR fund map warm failed ({type(e).__name__}: {e})")


def build_entity_trust(
    ticker: str,
    edgar: Optional[tuple[int, str | None]],
    fmp_filing_cik: Any,
    fmp_profile_cik: Any,
    fund: Optional[tuple[int, str, str]] = None,
) -> dict:
    """
    Compare EDGAR's identity for `ticker` against the CIK(s) the vendor stamped
    on the data, and return the single verdict every downstream surface gates on.

    `fmp_filing_cik` (the CIK on the income-statement rows) is preferred over
    `fmp_profile_cik` because it is stamped on the actual numbers being
    rendered, not on the ticker's metadata.

    The ladder:
      1. EDGAR and a vendor CIK both present -> match / contradiction.
      2. Not an operating registrant but present in SEC's fund file ->
         cannot_resolve, and the vendor-vs-vendor fallback is SKIPPED. A fund's
         statements are not filed by a comparable operating entity, so two
         disagreeing vendor CIKs there are not evidence of a wrong company —
         and hard-blocking an ETF page on that would be a false positive.
      3. EDGAR absent and not a known fund, but the vendor's own two CIKs
         disagree -> contradiction. This preserves the pre-existing
         vendor-vs-vendor check for genuinely unknown symbols.
      4. Otherwise -> cannot_resolve. Never blocks on identity grounds.

    Note step 1 still applies to funds that ARE operating registrants (SPY, GLD,
    USO, QQQ all file as trusts or LPs), because there the comparison is real.
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
    is_fund = fund is not None

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
    elif not edgar_cik and is_fund:
        # Positively identified as a registered fund. Not verifiable, not
        # blocked, and explicitly not subjected to the vendor-vs-vendor check.
        basis = BASIS_FUND
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
        "is_fund": is_fund,
        "fund_series_id": fund[1] if fund else None,
        "fund_class_id": fund[2] if fund else None,
    }


def normalize_company_name(name: Optional[str]) -> str:
    """Reduce a registrant name to its distinctive core for lineage comparison.

    Lowercases, drops punctuation and state-of-incorporation markers like
    "/DE/", and removes corporate-form words. "FREYR Battery, Inc. /DE/" and
    "FREYR Battery" both reduce to "freyr battery".
    """
    if not name:
        return ""
    lowered = re.sub(r"/[a-z]{2,3}/", " ", name.lower())
    cleaned = re.sub(r"[^a-z0-9\s]", " ", lowered)
    words = [w for w in cleaned.split() if w and w not in _NAME_NOISE]
    return " ".join(words)


def _names_of(submissions: Optional[dict]) -> set[str]:
    """Every name a registrant has been known by, normalized."""
    if not submissions:
        return set()
    names = [submissions.get("name")]
    names += [f.get("name") for f in (submissions.get("formerNames") or [])]
    return {n for n in (normalize_company_name(x) for x in names) if n}


def _is_dormant(submissions: Optional[dict]) -> bool:
    """Has this registrant stopped reporting or been delisted?

    Two independent signals: EDGAR listing no tickers/exchanges for it, and a
    Form 15 (deregistration) or Form 25 (delisting) in its filing history.
    """
    if not submissions:
        return False
    if not (submissions.get("tickers") or submissions.get("exchanges")):
        return True
    forms = ((submissions.get("filings") or {}).get("recent") or {}).get("form") or []
    return any(str(f).split("-")[0] in _DEREGISTRATION_FORMS for f in forms)


def _latest_filing(submissions: Optional[dict]) -> tuple[Optional[str], Optional[str]]:
    """(form, date) of the most recent filing on record, or (None, None)."""
    recent = ((submissions or {}).get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    if not forms:
        return None, None
    return forms[0], (dates[0] if dates else None)


def refine_contradiction(
    entity_trust: dict,
    edgar_submissions: Optional[dict],
    vendor_submissions: Optional[dict],
) -> dict:
    """
    Decide whether a contradiction is ticker *reuse* or corporate *succession*,
    and enrich the verdict with what EDGAR says about both registrants.

    Succession requires **name lineage**, and specifically an exact match after
    normalization against EDGAR's own `formerNames` — a structured statement
    that a registrant used to be called X, not a fuzzy similarity score between
    two arbitrary strings. Brief §7 rules out fabricating an identity *match*
    from name resemblance; this is the narrower job of telling two kinds of
    mismatch apart, and it downgrades a block rather than granting trust.

    Dormancy of the vendor's registrant is corroboration for the message, never
    the trigger: plenty of dead registrants are unrelated to the current one.
    """
    if entity_trust.get("verdict") != CONTRADICTION:
        return entity_trust

    refined = dict(entity_trust)
    edgar_names = _names_of(edgar_submissions)
    vendor_names = _names_of(vendor_submissions)

    vendor_name = (vendor_submissions or {}).get("name")
    predecessor_dormant = _is_dormant(vendor_submissions)
    edgar_form, edgar_date = _latest_filing(edgar_submissions)

    refined.update({
        "predecessor_name": vendor_name,
        "predecessor_dormant": predecessor_dormant,
        # Positively verified, not assumed. The old copy asserted the current
        # entity had "different or no SEC filings available" without ever
        # asking; for TE that was false.
        "edgar_has_filings": bool(edgar_form),
        "edgar_latest_form": edgar_form,
        "edgar_latest_filing_date": edgar_date,
        "edgar_exchanges": (edgar_submissions or {}).get("exchanges") or [],
        "edgar_tickers": (edgar_submissions or {}).get("tickers") or [],
    })

    shared_lineage = bool(edgar_names & vendor_names)
    if not shared_lineage:
        return refined  # unrelated entity — the contradiction stands

    predecessor = f" ({vendor_name})" if vendor_name else ""
    current = (
        f" ({refined['edgar_company_name']})"
        if refined.get("edgar_company_name") else ""
    )
    dormant_note = (
        " That registrant has since deregistered or delisted."
        if predecessor_dormant else ""
    )

    refined["verdict"] = SUCCESSOR
    refined["basis"] = BASIS_SUCCESSION
    refined["message"] = (
        f"These figures are filed under CIK {refined.get('fmp_filing_cik')}"
        f"{predecessor}, the predecessor registrant of the same business — a "
        f"reorganization or change of domicile mints a new CIK without the "
        f"company itself changing.{dormant_note} The current registrant is CIK "
        f"{refined.get('edgar_cik')}{current}, so anything filed after the "
        f"reorganization is not reflected here."
    )
    return refined


async def _submissions_cached(cik: int) -> Optional[dict]:
    """One submissions cache for the app, owned by `sec_filings` next to the
    fetcher. Identity, the IPO filter and the bankruptcy check all read the same
    records, so they should not each hold their own copy."""
    from app.services.sec_filings import fetch_submissions_cached

    return await fetch_submissions_cached(cik)


async def resolve_contradiction(entity_trust: dict) -> dict:
    """
    Async companion to `refine_contradiction`: fetch both registrants' EDGAR
    records and classify the mismatch as succession or genuine reuse.

    A no-op unless the verdict is a contradiction, so the common path costs
    nothing. Two cached submissions calls on the rare path; any failure leaves
    the contradiction standing, which is the safe direction — a mismatch we
    could not explain still blocks.
    """
    if entity_trust.get("verdict") != CONTRADICTION:
        return entity_trust

    edgar_cik = entity_trust.get("edgar_cik")
    vendor_cik = entity_trust.get("fmp_filing_cik") or entity_trust.get("fmp_profile_cik")
    if not edgar_cik or not vendor_cik:
        return entity_trust

    try:
        edgar_sub, vendor_sub = await asyncio.gather(
            _submissions_cached(edgar_cik),
            _submissions_cached(vendor_cik),
        )
    except Exception as e:
        print(f"WARN: could not classify contradiction ({type(e).__name__}: {e})")
        return entity_trust

    return refine_contradiction(entity_trust, edgar_sub, vendor_sub)


def is_contradicted(entity_trust: Optional[dict]) -> bool:
    """
    True only on a positive contradiction — the one verdict that blocks.

    Deliberately False for SUCCESSOR: predecessor financials are the same
    business's own history, so every gate that calls this proceeds normally and
    only the warning banner changes. Keeping the block-or-not decision in one
    predicate is what stops the surfaces drifting apart again.
    """
    return bool(entity_trust) and entity_trust.get("verdict") == CONTRADICTION


def is_successor(entity_trust: Optional[dict]) -> bool:
    """True when the vendor is serving the predecessor registrant's filings."""
    return bool(entity_trust) and entity_trust.get("verdict") == SUCCESSOR


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

    # ── Funds ────────────────────────────────────────────────────────────
    ulty_fund = (1924868, "S000084078", "C000248338")

    # Identified as a fund: not verifiable, not blocked, and flagged as such.
    t = build_entity_trust("ULTY", None, None, None, fund=ulty_fund)
    assert t["verdict"] == CANNOT_RESOLVE and t["basis"] == BASIS_FUND, t
    assert t["is_fund"] is True
    assert t["fund_series_id"] == "S000084078"
    assert not is_contradicted(t)

    # THE REGRESSION THIS BRANCH EXISTS FOR: a fund whose two vendor CIKs
    # disagree must NOT hard-block. Without the fund branch this is a
    # `fmp_internal` contradiction and an ETF page shows "Wrong Company".
    t = build_entity_trust("ULTY", None, "1844224", "1992243", fund=ulty_fund)
    assert t["verdict"] == CANNOT_RESOLVE, t
    assert t["basis"] == BASIS_FUND, t
    assert not is_contradicted(t), "a fund must never block on vendor disagreement"

    # Same inputs, no fund evidence -> the vendor-vs-vendor check still fires.
    t = build_entity_trust("ZZZZ", None, "1844224", "1992243")
    assert t["verdict"] == CONTRADICTION and t["basis"] == BASIS_FMP_INTERNAL

    # Funds that ARE operating registrants (SPY, GLD, USO, QQQ file as trusts
    # or LPs) still get the real comparison — being in the fund file too must
    # not weaken it. QQQ is in both files.
    qqq_fund = (1067839, "S000101292", "C000123456")
    t = build_entity_trust("QQQ", (1067839, "INVESCO QQQ TRUST, SERIES 1"),
                           "1067839", "1067839", fund=qqq_fund)
    assert t["verdict"] == MATCH, t
    assert t["is_fund"] is True, "both-files case: still a fund, and still matched"
    t = build_entity_trust("SPY", (884394, "SPDR S&P 500 ETF TRUST"),
                           "9999999", "9999999")
    assert t["verdict"] == CONTRADICTION, "a trust-registrant ETF is still checkable"

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

    # ── Succession vs reuse ──────────────────────────────────────────────
    # Shapes mirror real EDGAR submissions payloads for the TE case.
    t1_energy = {
        "name": "T1 Energy Inc.",
        "formerNames": [{"name": "FREYR Battery, Inc. /DE/"}],
        "tickers": ["TE"], "exchanges": ["NYSE"],
        "filings": {"recent": {"form": ["8-K", "10-Q"],
                               "filingDate": ["2026-08-28", "2026-08-07"]}},
    }
    freyr = {
        "name": "FREYR Battery",
        "formerNames": [],
        "tickers": [], "exchanges": [],
        "filings": {"recent": {"form": ["25-NSE", "15-12G"],
                               "filingDate": ["2026-07-09", "2024-01-12"]}},
    }

    assert normalize_company_name("FREYR Battery, Inc. /DE/") == "freyr battery"
    assert normalize_company_name("FREYR Battery") == "freyr battery"
    assert normalize_company_name("T1 Energy Inc.") == "t1 energy"
    assert normalize_company_name(None) == ""
    assert _is_dormant(freyr) is True, "no tickers/exchanges + Form 15/25"
    assert _is_dormant(t1_energy) is False
    assert _latest_filing(t1_energy) == ("8-K", "2026-08-28")

    base = build_entity_trust("TE", (1992243, "T1 Energy Inc."), "1844224", "1992243")
    assert base["verdict"] == CONTRADICTION

    # Lineage present -> succession, and it must NOT block.
    r = refine_contradiction(base, t1_energy, freyr)
    assert r["verdict"] == SUCCESSOR, r
    assert r["basis"] == BASIS_SUCCESSION
    assert is_successor(r) and not is_contradicted(r), "succession must not block"
    assert r["predecessor_name"] == "FREYR Battery"
    assert r["predecessor_dormant"] is True
    # §8: the current entity's filings are now positively verified, not assumed.
    assert r["edgar_has_filings"] is True
    assert r["edgar_latest_form"] == "8-K"
    assert "predecessor registrant" in r["message"]
    low = r["message"].lower()
    assert "no sec filings" not in low and "no filings" not in low, r["message"]

    # No lineage -> genuine reuse, contradiction stands and still blocks.
    unrelated = {"name": "Completely Different Shell Corp", "formerNames": [],
                 "tickers": [], "exchanges": [], "filings": {"recent": {}}}
    r2 = refine_contradiction(base, t1_energy, unrelated)
    assert r2["verdict"] == CONTRADICTION, r2
    assert is_contradicted(r2) and not is_successor(r2)
    # Enrichment still attached, so the message can name the other registrant.
    assert r2["predecessor_name"] == "Completely Different Shell Corp"

    # Corporate-form noise alone must never imply lineage.
    generic_a = {"name": "Holdings Inc.", "formerNames": [], "tickers": [],
                 "exchanges": [], "filings": {"recent": {}}}
    generic_b = {"name": "Holdings Corporation", "formerNames": [{"name": "The Company"}],
                 "tickers": ["X"], "exchanges": ["NYSE"], "filings": {"recent": {}}}
    assert normalize_company_name("Holdings Inc.") == ""
    r3 = refine_contradiction(base, generic_b, generic_a)
    assert r3["verdict"] == CONTRADICTION, "empty normalized names must not match"

    # Unavailable EDGAR records leave the contradiction standing (safe direction).
    r4 = refine_contradiction(base, None, None)
    assert r4["verdict"] == CONTRADICTION, r4
    assert r4["edgar_has_filings"] is False, "absence is not a claim of no filings"

    # A non-contradiction is passed through untouched.
    m = build_entity_trust("AAPL", (320193, "Apple Inc."), "320193", "320193")
    assert refine_contradiction(m, t1_energy, freyr) is m

    print("selftest OK - normalize_cik, verdict ladder, padding regression, "
          "messaging, succession vs reuse")
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
