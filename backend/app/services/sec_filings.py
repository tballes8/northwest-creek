"""
SEC EDGAR helpers.

FMP exposes SEC form *types* but not 8-K *item codes*, so anything that needs
item-level detail reads from SEC's free submissions API instead.

HTTP goes through `edgar_client.edgar_get`, which is now the single place in the
app that talks to sec.gov — it owns the one User-Agent (SEC rejects requests
without one) and the one 8 req/sec throttle. The SEC limit is per-IP, so each
EDGAR reader keeping its own limiter would let them jointly exceed it.
"""
import time
from datetime import date, datetime, timedelta
from typing import Optional

from app.services.edgar_client import edgar_get

# Submissions records, cached per CIK. The record is ~a megabyte for a prolific
# filer and several features now read it, so fetch it once per CIK per window.
_SUBMISSIONS_TTL_SECONDS = 6 * 3600
_submissions_cache: dict[int, tuple[float, Optional[dict]]] = {}

# How long before a listing date a registrant may already have been filing and
# still count as a new issuer. A genuine IPO files its S-1 months ahead, so the
# window has to be generous; anything filing more than a year out is an
# established company doing something other than going public.
IPO_PRIOR_FILING_GRACE_DAYS = 365

# How far back an Item 1.03 filing still counts as "on record". Long enough to
# cover a full restructuring, short enough that a company which emerged years
# ago stops being flagged.
BANKRUPTCY_LOOKBACK_DAYS = 550


async def fetch_submissions(cik) -> dict | None:
    """Fetch EDGAR's submissions record for a CIK, or None if unavailable.

    This is the richest single call about a registrant: filing history plus its
    current name, `formerNames`, and the `tickers`/`exchanges` EDGAR itself says
    the entity trades under. Returns None for "no such CIK OR could not check" —
    callers must not read a missing record as a statement of fact.

    Prolific filers shard older history into `-submissions-NNN.json`; only the
    `recent` block comes back here, which is what every current caller needs.
    """
    try:
        cik_padded = str(int(cik)).zfill(10)
    except (TypeError, ValueError):
        return None
    try:
        r = await edgar_get(f"https://data.sec.gov/submissions/CIK{cik_padded}.json")
        if r.status_code == 404:
            return None
        return r.json()
    except Exception:
        return None


async def fetch_submissions_cached(cik) -> dict | None:
    """`fetch_submissions` with a per-CIK TTL cache. Negative results cached too:
    a CIK EDGAR has no record of will not acquire one within the window."""
    try:
        key = int(cik)
    except (TypeError, ValueError):
        return None
    hit = _submissions_cache.get(key)
    if hit and (time.time() - hit[0]) < _SUBMISSIONS_TTL_SECONDS:
        return hit[1]
    payload = await fetch_submissions(key)
    _submissions_cache[key] = (time.time(), payload)
    return payload


def earliest_filing_date(submissions: Optional[dict]) -> Optional[str]:
    """Oldest filing date in the submissions `recent` block, ISO, or None.

    Prolific filers shard older history out of `recent`, so this is a *lower
    bound* on how long the registrant has existed — which is the safe direction
    for the only caller: if even the recent block starts years back, the
    registrant is unambiguously established.
    """
    recent = ((submissions or {}).get("filings") or {}).get("recent") or {}
    dates = recent.get("filingDate") or []
    # ISO dates sort lexicographically; the block is normally newest-first but
    # min() does not depend on that holding.
    return min(dates) if dates else None


async def is_new_issuer(
    ticker: str,
    listing_date: str | None,
    grace_days: int = IPO_PRIOR_FILING_GRACE_DAYS,
) -> bool:
    """
    Is `ticker` genuinely going public on `listing_date`, per EDGAR?

    Vendor IPO calendars mix in exchange transfers, uplistings and relistings —
    OPAD's NYSE→Nasdaq move showed up as an "IPO" on 2026-08-31 for a company
    public since its 2021 SPAC merger, with five years of price history behind
    it. The discriminator is the registrant's filing history, not the listing
    paperwork: a transfer files `8-A12B` exactly like a new listing does, so the
    form type alone would not tell them apart.

    **Fails open.** Unresolvable ticker, missing record or unparseable date all
    return True, because a genuine IPO can easily precede its appearance in
    SEC's ticker file and dropping real IPOs is the worse error.
    """
    if not listing_date:
        return True
    try:
        listed = datetime.strptime(listing_date[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return True

    from app.services.edgar_identity import resolve_ticker_cik

    resolved = await resolve_ticker_cik(ticker)
    if not resolved:
        return True

    submissions = await fetch_submissions_cached(resolved[0])
    earliest = earliest_filing_date(submissions)
    if not earliest:
        return True
    try:
        first = datetime.strptime(earliest[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return True

    return (listed - first).days <= grace_days


async def detect_bankruptcy(cik: str | None) -> dict | None:
    """Flag a recent 8-K Item 1.03 (Bankruptcy or Receivership) via SEC EDGAR.

    Item 1.03 doesn't encode chapter (7 vs 11) or entry-vs-emergence, so this is
    a hedged 'recent filing on record' flag, not a going-concern verdict.

    Returns {"detected": True, "date": ..., "link": ...} or None. None means
    "nothing found OR could not check" — callers that treat a missing flag as
    "clean" should be sure that's the behaviour they want.
    """
    if not cik:
        return None
    payload = await fetch_submissions(cik)
    if payload is None:
        return None
    recent = (payload.get("filings") or {}).get("recent") or {}

    forms = recent.get("form") or []
    items = recent.get("items") or []
    dates = recent.get("filingDate") or []
    accns = recent.get("accessionNumber") or []
    docs = recent.get("primaryDocument") or []
    cutoff = (date.today() - timedelta(days=BANKRUPTCY_LOOKBACK_DAYS)).isoformat()

    for i, form in enumerate(forms):
        if form != "8-K":
            continue
        item_str = (items[i] if i < len(items) else "") or ""
        if "1.03" not in item_str:
            continue
        filing_date = dates[i] if i < len(dates) else ""
        if filing_date < cutoff:  # ISO dates compare lexicographically
            continue
        acc = (accns[i] if i < len(accns) else "").replace("-", "")
        doc = docs[i] if i < len(docs) else ""
        link = (
            f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{doc}"
            if acc and doc else None
        )
        return {"detected": True, "date": filing_date, "link": link}
    return None
