"""
ETF universe probe — CLI, read-only.

Answers the questions that gate the ETF-screener build and cannot be answered from
the code. Nothing here writes to the database or to disk; it makes live FMP calls
and prints a report.

Run from backend/ with MASSIVE_API_KEY available (export it or put it in backend/.env):

    python scripts/probe_etf_universe.py           # full report
    python scripts/probe_etf_universe.py --json    # machine-readable

What it answers:

  P1  How many US ETFs does /company-screener return, and is it near the 10_000
      cap refresh_stock_snapshots uses? At the cap the universe is silently
      clipped and pagination has to land before anything else.

  P2  Does the ETF leg carry `beta`, `lastAnnualDividend` and `marketCap`?
      _build_universe exists to harvest the first two, and _update_dividends
      gates on the second. If they are absent for funds, ETF yields read blank
      unless the dividend gate is widened (+~4k calls/day), and the screener's
      default market_cap sort is meaningless in ETF mode.

  P3  What `exchange` string does batch-quote return for ETFs? _fetch_quotes
      gates on {NYSE, NASDAQ, AMEX} with an exact match. NYSE Arca and Cboe BZX
      list most funds; if FMP reports a value outside that set, ETFs are fetched
      and silently discarded — an empty ETF screener with no error anywhere.
      This is the decisive question.

  P4  Which /etf/info fields are reliably non-null across issuers? A field added
      to the registry that SPY happens to omit produces a false MISSING email
      every Monday. Also prints the expenseRatio distribution, since FMP's unit
      is inconsistent across funds (0.75 vs 0.0075 both meaning 0.75%) and the
      normalization threshold depends on how many funds land in (0, 0.02).

  P5  Does /stable/profile give ETFs a sector and a description? _MISSING_PROFILE
      is `sector IS NULL OR description IS NULL`, so if profiles have neither,
      every ETF row matches it forever and permanently starves the profile
      backfill budget.
"""
import argparse
import asyncio
import json
import os
import sys
from collections import Counter

import httpx

# Make `app` importable when run as `python scripts/probe_etf_universe.py` from backend/.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

FMP_BASE = "https://financialmodelingprep.com/stable"

# Mirrors refresh_stock_snapshots.SCREENER_LIMIT / QUOTE_BATCH_SIZE / US_EXCHANGES.
# Duplicated rather than imported so this script stays dependency-free (the task
# module pulls in app.config and the DB session at import time).
SCREENER_LIMIT = 10_000
QUOTE_BATCH_SIZE = 1000
US_EXCHANGES = {"NYSE", "NASDAQ", "AMEX"}

# Spread across issuers, asset classes, structures and fund sizes on purpose:
# index vs active, equity vs bond vs commodity vs crypto, plain vs leveraged,
# trust-structured vs 40-Act, mega-AUM vs micro. A field that is non-null across
# this set is safe to put in the registry; one that is null for any of them is not.
ETF_INFO_SAMPLE = [
    "SPY", "VOO", "IVV", "QQQ", "IWM", "VTI",           # mega-cap index
    "BKLC", "SPLG", "SCHD", "VYM", "DGRO", "MOAT",      # cheap / dividend / factor
    "JEPI", "ULTY", "QYLD",                             # option-income
    "BND", "TLT", "HYG", "BIL", "LQD",                  # fixed income
    "GLD", "SLV", "USO", "IBIT",                        # commodity / crypto trusts
    "TQQQ", "SQQQ", "UVXY",                             # leveraged / inverse
    "ARKK", "KWEB", "EFA", "VXUS", "SMH", "XLE",        # active / intl / sector
]


def _load_api_key() -> str:
    """MASSIVE_API_KEY from the environment, falling back to backend/.env."""
    key = os.environ.get("MASSIVE_API_KEY", "").strip()
    if key:
        return key
    env_path = os.path.join(_BACKEND_DIR, ".env")
    try:
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("MASSIVE_API_KEY="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    except OSError:
        pass
    return ""


async def _get(client: httpx.AsyncClient, path: str, params: dict) -> object:
    resp = await client.get(f"{FMP_BASE}/{path}", params=params)
    resp.raise_for_status()
    return resp.json()


async def _screener_leg(client, api_key, *, is_etf: bool, is_fund: bool = False) -> list:
    """One /company-screener call, shaped exactly like _build_universe's."""
    data = await _get(client, "company-screener", {
        "isEtf": "true" if is_etf else "false",
        "isFund": "true" if is_fund else "false",
        "isActivelyTrading": "true",
        "country": "US",
        "limit": SCREENER_LIMIT,
        "apikey": api_key,
    })
    return data if isinstance(data, list) else []


def _num(raw):
    try:
        return float(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


async def probe(api_key: str) -> dict:
    out: dict = {}
    async with httpx.AsyncClient(timeout=60.0) as client:

        # ---- P1 / P2: the ETF leg and its fundamentals coverage ----
        etf_rows = await _screener_leg(client, api_key, is_etf=True)
        fund_rows = await _screener_leg(client, api_key, is_etf=False, is_fund=True)

        # _build_universe drops these before they ever reach the DB; count what
        # would actually survive rather than the raw response length.
        survivors = [
            r for r in etf_rows
            if isinstance(r, dict)
            and (r.get("symbol") or "").strip()
            and "." not in (r.get("symbol") or "")
            and len((r.get("symbol") or "")) <= 10
        ]

        n = len(survivors) or 1
        out["P1_etf_universe"] = {
            "raw_count": len(etf_rows),
            "after_symbol_filter": len(survivors),
            "at_screener_limit": len(etf_rows) >= SCREENER_LIMIT,
            "screener_limit": SCREENER_LIMIT,
            "isFund_true_count": len(fund_rows),
        }
        out["P2_fundamentals_coverage"] = {
            "beta_pct": round(100 * sum(r.get("beta") is not None for r in survivors) / n, 1),
            "lastAnnualDividend_nonzero_pct": round(
                100 * sum((_num(r.get("lastAnnualDividend")) or 0) > 0 for r in survivors) / n, 1),
            "marketCap_pct": round(100 * sum(r.get("marketCap") is not None for r in survivors) / n, 1),
            "sector_pct": round(100 * sum(bool(r.get("sector")) for r in survivors) / n, 1),
        }

        # ---- P3: exchange strings, screener-reported vs quote-reported ----
        # The gate in _fetch_quotes reads batch-quote's `exchange`, NOT the
        # screener's, so both are printed: a disagreement between them is
        # itself the bug.
        screener_ex = Counter((r.get("exchange") or "<none>") for r in survivors)
        sample = [r["symbol"] for r in survivors[:QUOTE_BATCH_SIZE]]
        quote_ex: Counter = Counter()
        quotes_returned = 0
        if sample:
            quotes = await _get(client, "batch-quote",
                                {"symbols": ",".join(sample), "apikey": api_key})
            if isinstance(quotes, list):
                quotes_returned = len(quotes)
                quote_ex = Counter((q.get("exchange") or "<none>") for q in quotes)

        would_pass = sum(c for ex, c in quote_ex.items() if ex in US_EXCHANGES)
        out["P3_exchanges"] = {
            "screener_reported": screener_ex.most_common(20),
            "quote_reported": quote_ex.most_common(20),
            "sample_requested": len(sample),
            "quotes_returned": quotes_returned,
            "current_gate": sorted(US_EXCHANGES),
            "would_pass_current_gate": would_pass,
            "would_be_dropped": quotes_returned - would_pass,
            "missing_from_gate": sorted(ex for ex in quote_ex if ex not in US_EXCHANGES),
        }

        # ---- P4: etf/info field reliability + expenseRatio units ----
        sem = asyncio.Semaphore(8)

        async def _info(sym: str):
            async with sem:
                try:
                    data = await _get(client, "etf/info", {"symbol": sym, "apikey": api_key})
                except Exception as e:  # noqa: BLE001
                    return sym, {"__error__": str(e)[:120]}
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return sym, data[0]
            return sym, None

        infos = dict(await asyncio.gather(*(_info(s) for s in ETF_INFO_SAMPLE)))
        ok = {s: d for s, d in infos.items() if d and "__error__" not in d}

        keys: Counter = Counter()
        nonnull: Counter = Counter()
        for d in ok.values():
            for k, v in d.items():
                keys[k] += 1
                if v is not None and v != "":
                    nonnull[k] += 1

        m = len(ok) or 1
        expense = {s: _num(d.get("expenseRatio")) for s, d in ok.items()}
        out["P4_etf_info"] = {
            "requested": len(ETF_INFO_SAMPLE),
            "resolved": len(ok),
            "no_record": sorted(s for s, d in infos.items() if d is None),
            "errored": {s: d["__error__"] for s, d in infos.items() if d and "__error__" in d},
            # Sorted ascending so the fields that are NOT safe to register sit at the top.
            "field_nonnull_pct": sorted(
                ((k, round(100 * nonnull[k] / m, 1)) for k in keys), key=lambda kv: kv[1]),
            "expense_ratio_values": sorted(
                ((s, v) for s, v in expense.items()), key=lambda kv: (kv[1] is None, kv[1])),
            # The normalization threshold lives or dies on this bucket: a value in
            # (0, 0.02) is ambiguous between "a 1bp fee already in percent" and
            # "a fraction meaning <2%".
            "in_ambiguous_band": sorted(
                s for s, v in expense.items() if v is not None and 0 < v < 0.02),
            "looks_like_fraction": sum(
                1 for v in expense.values() if v is not None and 0 < v < 0.02),
            "looks_like_percent": sum(
                1 for v in expense.values() if v is not None and v >= 0.02),
            "asset_class_values": sorted({
                str(d.get("assetClass")) for d in ok.values() if d.get("assetClass")}),
            "etf_company_sample": sorted({
                str(d.get("etfCompany")) for d in ok.values() if d.get("etfCompany")})[:15],
        }

        # ---- P5: does /stable/profile give funds a sector and a description? ----
        async def _profile(sym: str):
            async with sem:
                try:
                    data = await _get(client, "profile", {"symbol": sym, "apikey": api_key})
                except Exception:  # noqa: BLE001
                    return sym, None
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return sym, data[0]
            return sym, None

        profs = dict(await asyncio.gather(*(_profile(s) for s in ETF_INFO_SAMPLE[:12])))
        got = {s: d for s, d in profs.items() if d}
        p = len(got) or 1
        out["P5_profile_for_funds"] = {
            "resolved": len(got),
            "sector_nonempty_pct": round(
                100 * sum(bool(d.get("sector")) for d in got.values()) / p, 1),
            "description_nonempty_pct": round(
                100 * sum(bool(d.get("description")) for d in got.values()) / p, 1),
            "isEtf_true_pct": round(100 * sum(bool(d.get("isEtf")) for d in got.values()) / p, 1),
            "isFund_true_pct": round(100 * sum(bool(d.get("isFund")) for d in got.values()) / p, 1),
            "per_symbol": {
                s: {"sector": d.get("sector") or None,
                    "has_description": bool(d.get("description")),
                    "isEtf": d.get("isEtf"), "isFund": d.get("isFund")}
                for s, d in sorted(got.items())
            },
        }

    return out


def format_report(r: dict) -> str:
    L = []
    a = L.append

    p1, p2 = r["P1_etf_universe"], r["P2_fundamentals_coverage"]
    a("=" * 72)
    a("P1  ETF UNIVERSE SIZE")
    a("=" * 72)
    a(f"  company-screener isEtf=true : {p1['raw_count']} rows")
    a(f"  after symbol filter         : {p1['after_symbol_filter']}")
    a(f"  isFund=true (not included)  : {p1['isFund_true_count']}")
    if p1["at_screener_limit"]:
        a(f"  !! AT THE {p1['screener_limit']} LIMIT - universe is being clipped.")
        a("     Add `page` pagination to _build_universe BEFORE anything else.")
    else:
        a(f"  OK - under the {p1['screener_limit']} cap, no pagination needed.")

    a("")
    a("=" * 72)
    a("P2  FUNDAMENTALS COVERAGE ON THE ETF LEG")
    a("=" * 72)
    for k, v in p2.items():
        a(f"  {k:34s}: {v}%")
    if p2["lastAnnualDividend_nonzero_pct"] < 5:
        a("  -> company-screener does NOT report dividends for funds.")
        a("     _update_dividends' gate must be widened with is_etf IS TRUE (+~4k calls/day)")
        a("     or every ETF yield reads blank.")
    else:
        a("  -> dividends ride along for free; _update_dividends needs no change.")
    if p2["marketCap_pct"] < 50:
        a("  -> marketCap is sparse for funds: the mode-aware default sort (aum) is REQUIRED,")
        a("     not optional, or ETF mode default-sorts on a mostly-NULL column.")

    p3 = r["P3_exchanges"]
    a("")
    a("=" * 72)
    a("P3  EXCHANGE STRINGS  <-- the decisive one")
    a("=" * 72)
    a(f"  current gate in _fetch_quotes: {p3['current_gate']}")
    a("  screener-reported:")
    for ex, c in p3["screener_reported"]:
        a(f"      {ex:24s} {c}")
    a(f"  batch-quote reported (sample of {p3['sample_requested']}, {p3['quotes_returned']} returned):")
    for ex, c in p3["quote_reported"]:
        flag = "" if ex in p3["current_gate"] else "   <-- DROPPED by the gate"
        a(f"      {ex:24s} {c}{flag}")
    a(f"  would pass : {p3['would_pass_current_gate']}")
    a(f"  would drop : {p3['would_be_dropped']}")
    if p3["missing_from_gate"]:
        a(f"  !! ADD TO US_EXCHANGES: {p3['missing_from_gate']}")
    else:
        a("  OK - the existing gate covers every venue in the sample. No constant change.")

    p4 = r["P4_etf_info"]
    a("")
    a("=" * 72)
    a("P4  etf/info FIELD RELIABILITY")
    a("=" * 72)
    a(f"  resolved {p4['resolved']}/{p4['requested']}")
    if p4["no_record"]:
        a(f"  no record: {p4['no_record']}")
    if p4["errored"]:
        a(f"  errored  : {p4['errored']}")
    a("  field non-null %, worst first (anything < 100 is UNSAFE to register):")
    for k, pct in p4["field_nonnull_pct"]:
        flag = "   <-- do NOT add to registry key_fields" if pct < 100 else ""
        a(f"      {k:28s} {pct:5.1f}%{flag}")
    a("  expenseRatio values:")
    for s, v in p4["expense_ratio_values"]:
        a(f"      {s:6s} {v}")
    a(f"  looks like a fraction (0 < v < 0.02): {p4['looks_like_fraction']}")
    a(f"  looks like a percent  (v >= 0.02)   : {p4['looks_like_percent']}")
    if p4["in_ambiguous_band"]:
        a(f"  !! ambiguous band members: {p4['in_ambiguous_band']}")
        a("     Each is either a genuine 1bp fee or a fraction. Confirm against the")
        a("     fund's real fee before settling _EXPENSE_RATIO_PCT_FLOOR at 0.02.")
    a(f"  assetClass vocabulary: {p4['asset_class_values']}")
    a(f"  etfCompany sample    : {p4['etf_company_sample']}")

    p5 = r["P5_profile_for_funds"]
    a("")
    a("=" * 72)
    a("P5  /stable/profile FOR FUNDS")
    a("=" * 72)
    a(f"  resolved {p5['resolved']}")
    a(f"  sector non-empty      : {p5['sector_nonempty_pct']}%")
    a(f"  description non-empty : {p5['description_nonempty_pct']}%")
    a(f"  isEtf true            : {p5['isEtf_true_pct']}%")
    a(f"  isFund true           : {p5['isFund_true_pct']}%")
    if p5["sector_nonempty_pct"] < 100 or p5["description_nonempty_pct"] < 100:
        a("  -> _MISSING_PROFILE (sector IS NULL OR description IS NULL) WOULD match ETF rows")
        a("     forever. The _STOCK_ONLY guard on the profile pass is REQUIRED.")
    a("  per-symbol:")
    for s, d in p5["per_symbol"].items():
        a(f"      {s:6s} sector={str(d['sector']):22s} desc={str(d['has_description']):5s} "
          f"isEtf={d['isEtf']} isFund={d['isFund']}")

    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser(description="Probe FMP's ETF surface before building the ETF screener.")
    ap.add_argument("--json", action="store_true", help="Emit JSON instead of a human report.")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

    api_key = _load_api_key()
    if not api_key:
        print("ERROR: MASSIVE_API_KEY is not set (env or backend/.env) - cannot hit the FMP API.",
              file=sys.stderr)
        return 2

    results = asyncio.run(probe(api_key))
    print(json.dumps(results, indent=2) if args.json else format_report(results))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
