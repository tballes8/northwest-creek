"""
FMP /stable/ field-name audit — shared core.

Verifies that the response field names the endpoint registry documents actually
exist in *live* /stable/ responses. Reading a stale field name (e.g. v3-era
`mktCap` vs stable `marketCap`) returns None silently — a latent bug with no
error. This is the active counterpart to changelog_review.py (reactive): it
probes the API directly and needs no changelog.

Two consumers share this module:
  - scripts/audit_fmp_fields.py  — CLI (reads key from env/.env, prints report)
  - app/tasks/audit_fmp_fields_task.py — weekly scheduled job (emails on drift)

This module depends only on httpx + stdlib + the (pure) endpoint registry — it
does NOT import app.config/fmp_client, so the CLI stays runnable without booting
the app. The API key and base URL are passed in by the caller.
"""
import asyncio
import re
from datetime import date, timedelta

import httpx

from app.services.fmp_endpoint_registry import FMP_ENDPOINTS

FMP_BASE = "https://financialmodelingprep.com/stable/"


def _iso(d: date) -> str:
    return d.isoformat()


def _recent_13f(today: date) -> tuple[int, int]:
    """Most recently *filed* (year, quarter). 13F data lags ~45 days, so step
    back one quarter from the current one."""
    q = (today.month - 1) // 3 + 1
    y = today.year
    q -= 1
    if q == 0:
        q, y = 4, y - 1
    return y, q


def build_sample_params() -> dict[str, dict]:
    """Per-path sample request params (apikey added by the caller). Date ranges
    are computed fresh on each call so a long-running server never sends stale
    `from`/`to` windows. Paths not listed default to {"symbol": "AAPL"}."""
    today = date.today()
    y13f, q13f = _recent_13f(today)
    return {
        "quote": {"symbol": "AAPL"},
        "batch-quote": {"symbols": "AAPL,MSFT"},
        "historical-price-eod/full": {"symbol": "AAPL", "from": _iso(today - timedelta(days=35)), "to": _iso(today)},
        "historical-chart/1min": {"symbol": "AAPL", "from": _iso(today - timedelta(days=5)), "to": _iso(today)},
        "batch-aftermarket-trade": {"symbols": "AAPL"},
        "profile": {"symbol": "AAPL"},
        "income-statement": {"symbol": "AAPL", "period": "quarter", "limit": 4},
        "balance-sheet-statement": {"symbol": "AAPL", "period": "quarter", "limit": 4},
        "cash-flow-statement": {"symbol": "AAPL", "period": "quarter", "limit": 4},
        "ratios-ttm": {"symbol": "AAPL"},
        "key-metrics-ttm": {"symbol": "AAPL"},
        "shares-float": {"symbol": "AAPL"},
        "discounted-cash-flow": {"symbol": "AAPL"},
        "levered-discounted-cash-flow": {"symbol": "AAPL"},
        "custom-discounted-cash-flow": {"symbol": "AAPL"},
        "analyst-estimates": {"symbol": "AAPL", "period": "annual", "limit": 4},
        "price-target-consensus": {"symbol": "AAPL"},
        "institutional-ownership/extract-analytics/holder": {
            "symbol": "AAPL", "year": y13f, "quarter": q13f, "page": 0, "limit": 10,
        },
        "sec-filings-search/symbol": {"symbol": "AAPL", "from": _iso(today - timedelta(days=365)), "to": _iso(today)},
        "news/stock": {"symbols": "AAPL", "limit": 5},
        "news/stock-latest": {"page": 0, "limit": 5},
        "dividends": {"symbol": "AAPL"},
        "most-actives": {},
        "biggest-gainers": {},
        "biggest-losers": {},
        "exchange-market-hours": {"exchange": "NASDAQ"},
        "holidays-by-exchange": {"exchange": "NASDAQ"},
        "ipos-calendar": {"from": _iso(today - timedelta(days=35)), "to": _iso(today + timedelta(days=30))},
        "earnings-calendar": {"from": _iso(today), "to": _iso(today + timedelta(days=30))},
        "search-name": {"query": "apple", "limit": 5},
        "search-symbol": {"query": "AAPL", "limit": 5},
        "company-screener": {"marketCapMoreThan": 1_000_000_000, "limit": 5},
        "stock-list": {},
        "etf-list": {},
        "delisted-companies": {"page": 0},
        "etf/info": {"symbol": "SPY"},
        "etf/holdings": {"symbol": "SPY"},
        "treasury-rates": {"from": _iso(today - timedelta(days=7)), "to": _iso(today)},
        "batch-commodity-quotes": {},
        "batch-crypto-quotes": {},
        "batch-index-quotes": {},
        "technical-indicators/sma": {"symbol": "AAPL", "timeframe": "1day", "periodLength": 20},
    }


def _redact(msg: str) -> str:
    return re.sub(r"(apikey|api_key|token)=[^&\s'\"]+", r"\1=***", msg)


def _first_record_keys(data) -> set[str] | None:
    """Top-level field names of the first record, or None if there's no record."""
    if isinstance(data, list):
        if not data or not isinstance(data[0], dict):
            return None
        return set(data[0].keys())
    if isinstance(data, dict):
        if not data or set(data.keys()) <= {"Error Message", "error", "message"}:
            return None
        return set(data.keys())
    return None


async def _audit_one(client: httpx.AsyncClient, sem: asyncio.Semaphore,
                     entry: dict, api_key: str, sample_params: dict[str, dict]) -> dict:
    path = entry["path"]
    params = dict(sample_params.get(path, {"symbol": "AAPL"}))
    params["apikey"] = api_key
    expected = list(entry.get("key_fields") or [])
    async with sem:
        try:
            r = await client.get(path, params=params)
            r.raise_for_status()
            data = r.json()
        except Exception as e:  # noqa: BLE001 - report, don't crash the whole run
            return {"path": path, "status": "ERROR", "detail": _redact(str(e))}

    keys = _first_record_keys(data)
    if keys is None:
        return {"path": path, "status": "NO_DATA",
                "detail": "empty response or unrecognized shape - adjust sample params"}

    missing = [f for f in expected if f not in keys]
    extra = sorted(keys - set(expected))
    return {
        "path": path,
        "status": "MISSING" if missing else "OK",
        "missing": missing,
        "extra": extra,
        "live_keys": sorted(keys),
    }


async def run_audit(api_key: str, base_url: str = FMP_BASE,
                    paths: list[str] | None = None) -> list[dict]:
    """Probe each registered endpoint and return a per-endpoint result list.

    Each result: {path, status: OK|MISSING|NO_DATA|ERROR, missing, extra, live_keys}.
    """
    entries = FMP_ENDPOINTS
    if paths:
        wanted = set(paths)
        entries = [e for e in FMP_ENDPOINTS if e["path"] in wanted]

    sample_params = build_sample_params()
    sem = asyncio.Semaphore(4)  # be gentle with rate limits
    async with httpx.AsyncClient(base_url=base_url, timeout=20.0) as client:
        return await asyncio.gather(
            *(_audit_one(client, sem, e, api_key, sample_params) for e in entries)
        )


def summarize(results: list[dict]) -> dict:
    """Bucket results by status for reporting/alerting decisions."""
    return {
        "missing": [r for r in results if r["status"] == "MISSING"],
        "no_data": [r for r in results if r["status"] == "NO_DATA"],
        "errors": [r for r in results if r["status"] == "ERROR"],
        "ok": [r for r in results if r["status"] == "OK"],
        "total": len(results),
    }


def format_text_report(results: list[dict]) -> str:
    """ASCII report (Windows-cp1252 safe). Returned as a string for the caller."""
    lines: list[str] = []
    width = max((len(r["path"]) for r in results), default=10)
    for r in sorted(results, key=lambda x: (x["status"] != "MISSING", x["path"])):
        path = r["path"].ljust(width)
        status = r["status"]
        if status == "MISSING":
            lines.append(f"[MISSING] {path}  not in live response: {', '.join(r['missing'])}")
            if r.get("extra"):
                shown = ", ".join(r["extra"][:12]) + ("..." if len(r["extra"]) > 12 else "")
                lines.append(f"          {' ' * width}  (live also has: {shown})")
        elif status == "OK":
            lines.append(f"[OK]      {path}  ({len(r['live_keys'])} fields)")
        elif status == "NO_DATA":
            lines.append(f"[NO_DATA] {path}  {r.get('detail', '')}")
        else:
            lines.append(f"[ERROR]   {path}  {r.get('detail', '')}")

    s = summarize(results)
    lines.append("\n" + "-" * 60)
    lines.append(f"SUMMARY: {len(s['missing'])} with MISSING fields | {len(s['no_data'])} NO_DATA | "
                 f"{len(s['errors'])} ERROR | {s['total']} total")
    if s["missing"]:
        lines.append("  Stale field names to fix (registry + code):")
        for r in s["missing"]:
            lines.append(f"    - {r['path']}: {', '.join(r['missing'])}")
    return "\n".join(lines)


def format_html_report(results: list[dict]) -> str:
    """Compact HTML for the alert email. Only shows non-OK rows + a summary."""
    s = summarize(results)

    def _rows(items: list[dict], detail_key: str) -> str:
        out = []
        for r in items:
            if detail_key == "missing":
                detail = ", ".join(r.get("missing") or [])
            else:
                detail = r.get("detail", "")
            out.append(
                f"<tr><td style='padding:4px 10px;font-family:monospace'>{r['path']}</td>"
                f"<td style='padding:4px 10px'>{detail}</td></tr>"
            )
        return "".join(out)

    sections = []
    if s["missing"]:
        sections.append(
            "<h3 style='color:#b45309;margin:16px 0 4px'>MISSING fields (likely stale names)</h3>"
            "<table style='border-collapse:collapse;font-size:13px'>"
            "<tr><th style='text-align:left;padding:4px 10px'>Endpoint</th>"
            "<th style='text-align:left;padding:4px 10px'>Documented fields absent from live response</th></tr>"
            f"{_rows(s['missing'], 'missing')}</table>"
        )
    if s["errors"]:
        sections.append(
            "<h3 style='color:#6b7280;margin:16px 0 4px'>Errors (may be transient — rate-limit / network)</h3>"
            "<table style='border-collapse:collapse;font-size:13px'>"
            f"{_rows(s['errors'], 'detail')}</table>"
        )
    if s["no_data"]:
        sections.append(
            "<h3 style='color:#6b7280;margin:16px 0 4px'>No data (sample params may need a tweak)</h3>"
            "<table style='border-collapse:collapse;font-size:13px'>"
            f"{_rows(s['no_data'], 'detail')}</table>"
        )

    return (
        "<div style='font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111'>"
        f"<p>FMP <code>/stable/</code> field audit found <strong>{len(s['missing'])}</strong> "
        f"endpoint(s) with stale field names out of {s['total']} checked.</p>"
        f"{''.join(sections)}"
        "<p style='margin-top:16px;color:#374151'>Fix: update the field reads in code and the "
        "<code>fmp_endpoint_registry.py</code> entries to the live names, then re-run "
        "<code>python scripts/audit_fmp_fields.py</code> to confirm zero MISSING.</p>"
        "</div>"
    )
