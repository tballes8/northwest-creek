"""
edgar_dividends.py
==================

Standalone SEC EDGAR client for dividend verification — the structured,
model-free half of the dividend-status "reader".

Purpose
-------
Report what a company's *own SEC filings* say about its dividend history,
straight from the source of record (EDGAR XBRL), so it can be diffed against
whatever a market-data vendor (e.g. FMP) is annualizing into a yield. When the
vendor projects income from a dividend the filings no longer substantiate, that
gap is the phantom-yield signal (the NFE case).

This module knows nothing about FMP. It only reports EDGAR's version of the
truth. The comparison against vendor data is a separate, thin function you own.

What XBRL can and cannot tell you
---------------------------------
EDGAR's structured data exposes dividends-per-share *declared* (and, as a
fallback, *cash paid*) over reporting periods (quarterly/annual), tagged in the
us-gaap taxonomy. That is enough to answer the question that matters here:
"According to its own filings, is this company still actually paying a dividend,
and when was the last period it did?"

XBRL does *not* expose ex-dividend dates or per-payment announcement dates —
those are market/exchange concepts, not financial-statement concepts. So this
client reports recency at *reporting-period* granularity, not ex-date
granularity. True announcement/ex-date precision (e.g. an 8-K announcing a
suspension before it appears in the next 10-Q) is exactly the residual the prose
reader is meant to catch later. This module deliberately does not pretend to
provide it.

Access rules (SEC fair-access policy)
-------------------------------------
No API key, but EDGAR requires a User-Agent naming the app and a real contact
email or it returns 403, and holds callers to 10 req/sec per IP. Both are owned
by `edgar_client`, which every EDGAR reader in the app shares -- a per-module
throttle would not compose with the others against a per-IP limit.

Ticker->CIK resolution is likewise not done here: it goes through
`edgar_identity.resolve_ticker_cik`, the one resolver backed by the one cached
copy of `company_tickers.json`. Identity has exactly one source of truth.

Usage
-----
    client = EdgarDividendClient()
    result = await client.get_dividend_facts("NFE")

Or run directly, from `backend/`:
    python -m app.services.edgar_dividends NFE
    python -m app.services.edgar_dividends --selftest   # offline, no network
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timezone

from app.services.edgar_client import edgar_get
from app.services.edgar_identity import resolve_ticker_cik


# ── Endpoints & constants ────────────────────────────────────────────────────
_CONCEPT_URL = (
    "https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{tag}.json"
)

# Preference order: "declared" is the intent to pay; "cash paid" is the fallback
# for issuers that only tag the paid concept.
_DIVIDEND_TAGS = (
    "CommonStockDividendsPerShareDeclared",
    "CommonStockDividendsPerShareCashPaid",
)

# ── Result types ─────────────────────────────────────────────────────────────
@dataclass
class DividendPeriod:
    """One reporting-period dividend-per-share fact, as filed with the SEC."""
    period_start: str | None   # ISO date; duration concept start
    period_end: str            # ISO date; duration concept end
    amount: float              # dividends per share, USD, for this period
    form: str | None           # e.g. "10-Q", "10-K"
    filed: str | None          # ISO date the filing was submitted


@dataclass
class DividendFacts:
    """
    Normalized EDGAR view of a company's dividend history.

    This is the source-of-record object. The diff against vendor data lives
    elsewhere; nothing here references FMP.
    """
    ticker: str
    cik: int | None
    company_name: str | None
    concept_used: str | None            # which us-gaap tag supplied the data
    has_dividend_facts: bool
    last_dividend_period_end: str | None   # NOT an ex-date; see module docstring
    last_dividend_amount: float | None     # per share, for the most recent period
    last_positive_period_end: str | None   # most recent period with amount > 0
    last_filed: str | None                 # filing date of the most recent fact
    quarters_since_last_positive: float | None  # staleness signal, relative to today
    frequency_hint: str | None          # approximate; reflects filing-period cadence
    history: list[DividendPeriod]       # cleaned, deduped, ascending by period_end
    source: str
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


# ── Client ───────────────────────────────────────────────────────────────────
class EdgarDividendClient:
    """
    Fetches and normalizes dividend facts from SEC EDGAR XBRL for one ticker.

    Holds no HTTP state: the User-Agent, throttle, retries and connection pool
    all belong to `edgar_client`, and ticker->CIK resolution belongs to
    `edgar_identity`. What is left here is the dividend-specific concern --
    which us-gaap concepts to read and how to normalize them.
    """

    # ── Parsing (pure; unit-testable without network) ──────────────────────────
    @staticmethod
    def _extract_shares_unit_facts(payload: dict) -> list[dict]:
        """Pull the per-share fact list out of a companyconcept payload.

        Per-share concepts report under a unit key that contains "shares". The
        JSON typically uses "USD/shares", but the SEC also documents a "-per-"
        rendering (e.g. "USD-per-shares"), so match on the "shares" substring
        rather than an exact key. Prefer a USD-denominated per-share unit when
        more than one is present."""
        units = payload.get("units") or {}
        share_keys = [k for k in units if "shares" in k.lower()]
        for k in share_keys:
            if "usd" in k.lower():
                return list(units[k])
        if share_keys:
            return list(units[share_keys[0]])
        # Fallback: some payloads key it differently; take the first unit list.
        for facts in units.values():
            return list(facts)
        return []

    @staticmethod
    def _clean_and_dedupe(raw_facts: list[dict]) -> list[DividendPeriod]:
        """
        Normalize raw XBRL facts into DividendPeriod rows.

        Dedupe by (start, end): XBRL restates the same period across later
        filings, so keep the row with the latest `filed` date for each period.
        Keep only duration facts (those with both start and end); instantaneous
        facts aren't dividend-period values. Return ascending by period_end.
        """
        best: dict[tuple[str | None, str], dict] = {}
        for f in raw_facts:
            end = f.get("end")
            if not end:
                continue
            start = f.get("start")
            key = (start, end)
            prev = best.get(key)
            if prev is None or (f.get("filed") or "") > (prev.get("filed") or ""):
                best[key] = f

        rows = [
            DividendPeriod(
                period_start=f.get("start"),
                period_end=f["end"],
                amount=float(f.get("val", 0.0)),
                form=f.get("form"),
                filed=f.get("filed"),
            )
            for f in best.values()
        ]
        rows.sort(key=lambda r: r.period_end)
        return rows

    @staticmethod
    def _infer_frequency_hint(history: list[DividendPeriod]) -> str | None:
        """
        Approximate cadence from the median duration of recent periods.

        Caveat: dividends-per-share-declared in a 10-Q is the amount over the
        *reporting period*, so this reflects filing-period cadence, not
        necessarily per-payment frequency (a monthly payer and a quarterly payer
        can both surface as ~quarterly here). Treat as a hint only.
        """
        durations: list[int] = []
        for r in history[-8:]:
            if r.period_start and r.period_end:
                try:
                    d0 = date.fromisoformat(r.period_start)
                    d1 = date.fromisoformat(r.period_end)
                    durations.append((d1 - d0).days)
                except ValueError:
                    continue
        if not durations:
            return None
        durations.sort()
        med = durations[len(durations) // 2]
        if med <= 45:
            return "monthly"
        if med <= 135:
            return "quarterly"
        if med <= 210:
            return "semiannual"
        return "annual"

    @classmethod
    def _summarize(
        cls,
        ticker: str,
        cik: int | None,
        company_name: str | None,
        concept: str | None,
        history: list[DividendPeriod],
        today: date | None = None,
    ) -> DividendFacts:
        today = today or datetime.now(timezone.utc).date()
        notes: list[str] = [
            "Recency is at reporting-period granularity. XBRL does not expose "
            "ex-dividend or announcement dates; a suspension announced in an 8-K "
            "may not appear here until the next periodic filing.",
        ]

        if not history:
            notes.append(
                "No dividend-per-share facts found in EDGAR for the queried tag(s). "
                "If a vendor shows a dividend yield for this ticker, that is itself "
                "a discrepancy worth flagging."
            )
            return DividendFacts(
                ticker=ticker.upper(),
                cik=cik,
                company_name=company_name,
                concept_used=concept,
                has_dividend_facts=False,
                last_dividend_period_end=None,
                last_dividend_amount=None,
                last_positive_period_end=None,
                last_filed=None,
                quarters_since_last_positive=None,
                frequency_hint=None,
                history=[],
                source="SEC EDGAR XBRL (us-gaap dividends-per-share)",
                notes=notes,
            )

        last = history[-1]
        positive = [r for r in history if r.amount > 0]
        last_positive = positive[-1] if positive else None

        quarters_since = None
        if last_positive is not None:
            try:
                lp = date.fromisoformat(last_positive.period_end)
                quarters_since = round((today - lp).days / 91.3125, 1)
            except ValueError:
                quarters_since = None

        if last_positive is None:
            notes.append(
                "All dividend-per-share facts on record are zero. Filings do not "
                "substantiate any dividend."
            )
        elif quarters_since is not None and quarters_since >= 2:
            notes.append(
                f"Most recent positive dividend period ended {last_positive.period_end} "
                f"(~{quarters_since} quarters ago). A vendor still annualizing a "
                f"dividend here should be treated as suspect."
            )

        return DividendFacts(
            ticker=ticker.upper(),
            cik=cik,
            company_name=company_name,
            concept_used=concept,
            has_dividend_facts=True,
            last_dividend_period_end=last.period_end,
            last_dividend_amount=last.amount,
            last_positive_period_end=last_positive.period_end if last_positive else None,
            last_filed=last.filed,
            quarters_since_last_positive=quarters_since,
            frequency_hint=cls._infer_frequency_hint(history),
            history=history,
            source=f"SEC EDGAR XBRL (us-gaap:{concept})" if concept else "SEC EDGAR XBRL",
            notes=notes,
        )

    # ── Public API ─────────────────────────────────────────────────────────────
    async def get_dividend_facts(self, ticker: str) -> DividendFacts:
        """Resolve ticker→CIK, fetch dividend XBRL (with tag fallback), and
        return the normalized source-of-record view.

        Raises LookupError when EDGAR cannot resolve the ticker. That is this
        module's long-standing contract and nothing consumes it yet; callers
        that must not raise (anything inside request handling) should use
        `edgar_identity.resolve_ticker_cik` directly, which returns None.
        """
        resolved = await resolve_ticker_cik(ticker)
        if resolved is None:
            raise LookupError(
                f"Ticker {ticker!r} not found in SEC company_tickers.json. It may be "
                f"a non-US filer (EDGAR covers SEC registrants only), a delisted "
                f"symbol, or a symbol that maps to a foreign listing (e.g. a TSXV "
                f"line), none of which EDGAR tracks."
            )
        cik, company_name = resolved

        for tag in _DIVIDEND_TAGS:
            resp = await edgar_get(_CONCEPT_URL.format(cik=cik, tag=tag))
            if resp.status_code == 404:
                continue  # try the next tag
            raw = self._extract_shares_unit_facts(resp.json())
            history = self._clean_and_dedupe(raw)
            if history:
                return self._summarize(ticker, cik, company_name, tag, history)

        # No dividend tags present at all.
        return self._summarize(ticker, cik, company_name, None, [])


# ── Offline self-test (no network) ───────────────────────────────────────────
def _selftest() -> int:
    """Exercise the parsing/dedup/recency logic against a synthetic payload
    shaped like a real companyconcept response. No network required."""
    payload = {
        "units": {
            "USD/shares": [
                # Same period restated across two filings — dedupe keeps latest filed.
                {"start": "2023-01-01", "end": "2023-03-31", "val": 0.10,
                 "form": "10-Q", "filed": "2023-05-01"},
                {"start": "2023-01-01", "end": "2023-03-31", "val": 0.10,
                 "form": "10-Q/A", "filed": "2023-08-01"},
                {"start": "2023-04-01", "end": "2023-06-30", "val": 0.10,
                 "form": "10-Q", "filed": "2023-08-01"},
                # Dividend cut to zero — the suspension case.
                {"start": "2023-07-01", "end": "2023-09-30", "val": 0.00,
                 "form": "10-Q", "filed": "2023-11-01"},
            ]
        }
    }
    raw = EdgarDividendClient._extract_shares_unit_facts(payload)
    history = EdgarDividendClient._clean_and_dedupe(raw)

    assert len(history) == 3, f"expected 3 deduped periods, got {len(history)}"
    assert history[-1].period_end == "2023-09-30", "history not ascending by end"
    assert history[-1].amount == 0.0, "latest period should be the zero (suspended)"

    facts = EdgarDividendClient._summarize(
        "TEST", 123, "Test Corp", "CommonStockDividendsPerShareDeclared",
        history, today=date(2024, 6, 30),
    )
    assert facts.has_dividend_facts is True
    assert facts.last_dividend_amount == 0.0
    assert facts.last_positive_period_end == "2023-06-30"
    assert facts.quarters_since_last_positive == 4.0, facts.quarters_since_last_positive
    assert facts.frequency_hint == "quarterly", facts.frequency_hint
    assert any("suspect" in n for n in facts.notes)

    # Empty case: vendor could still claim a yield -> flagged as discrepancy.
    empty = EdgarDividendClient._summarize("NONE", 1, "No Div Inc", None, [])
    assert empty.has_dividend_facts is False
    assert any("discrepancy" in n for n in empty.notes)

    print("selftest OK — parsing, dedupe, recency, and empty-case logic all pass")
    return 0


# ── CLI ──────────────────────────────────────────────────────────────────────
async def _run_ticker(ticker: str) -> None:
    import json
    client = EdgarDividendClient()
    facts = await client.get_dividend_facts(ticker)
    print(json.dumps(facts.to_dict(), indent=2, default=str))


def _main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: python -m app.services.edgar_dividends <TICKER> | --selftest")
        return 2
    if argv[1] == "--selftest":
        return _selftest()
    asyncio.run(_run_ticker(argv[1]))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv))
