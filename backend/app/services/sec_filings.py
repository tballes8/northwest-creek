"""
SEC EDGAR helpers.

FMP exposes SEC form *types* but not 8-K *item codes*, so anything that needs
item-level detail reads from SEC's free submissions API instead. This module is
the single place in the app that talks to data.sec.gov.
"""
import httpx
from datetime import date, timedelta

# SEC EDGAR requires a descriptive User-Agent with contact info on every request.
SEC_USER_AGENT = "NWC-Analytics/1.0 (support@nwc-analytics.com)"

# How far back an Item 1.03 filing still counts as "on record". Long enough to
# cover a full restructuring, short enough that a company which emerged years
# ago stops being flagged.
BANKRUPTCY_LOOKBACK_DAYS = 550


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
    try:
        cik_padded = str(int(cik)).zfill(10)
    except (TypeError, ValueError):
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as sec:
            r = await sec.get(
                f"https://data.sec.gov/submissions/CIK{cik_padded}.json",
                headers={"User-Agent": SEC_USER_AGENT, "Accept": "application/json"},
            )
            r.raise_for_status()
            recent = (r.json().get("filings") or {}).get("recent") or {}
    except Exception:
        return None

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
