"""
FMP endpoint registry — the inventory of every Financial Modeling Prep endpoint
NWC depends on, where each is called, and the response fields our code reads.

This is the source of truth handed to Claude when reviewing FMP's changelog
(see `changelog_review.py`): it lets the model map a vendor change to the exact
NWC code that would break. It also doubles as living documentation.

KEEP THIS IN SYNC when you add/remove FMP calls. `path` is the path relative to
the FMP base `https://financialmodelingprep.com/stable/`. `used_by` line numbers
are approximate hints — the file path is what matters. `key_fields` are the
response fields our code actually reads (so field renames/removals get flagged).
"""
from typing import Any

# Each entry: path, description, used_by (file:line hints), key_fields (response fields we read)
FMP_ENDPOINTS: list[dict[str, Any]] = [
    # ── Quotes & prices ──────────────────────────────────────────────
    {"path": "quote", "description": "Real-time quote for a single ticker",
     "used_by": ["services/market_data.py:79", "api/v1/endpoints/intraday.py:248",
                 "api/v1/endpoints/stocks.py:362"],
     "key_fields": ["symbol", "price", "open", "previousClose", "change", "changePercentage", "volume"]},
    {"path": "batch-quote", "description": "Batch quotes for many symbols (screener, snapshots, ticker tape)",
     "used_by": ["services/market_data.py:119", "api/v1/endpoints/intraday.py:181",
                 "tasks/fetch_daily_snapshots.py:137", "tasks/refresh_stock_snapshots.py:120"],
     "key_fields": ["symbol", "price", "open", "changePercentage", "change", "volume", "avgVolume",
                    "dayLow", "dayHigh", "yearHigh", "yearLow", "marketCap", "priceAvg50", "priceAvg200",
                    "exchange", "previousClose", "timestamp"]},
    {"path": "historical-price-eod/full", "description": "End-of-day historical prices with date range",
     "used_by": ["services/market_data.py:213"],
     "key_fields": ["date", "close", "open", "high", "low", "volume"]},
    {"path": "historical-chart/1min", "description": "Intraday 1-minute bars for a date range",
     "used_by": ["api/v1/endpoints/intraday.py:327"],
     "key_fields": ["date", "open", "high", "low", "close", "volume"]},
    {"path": "batch-aftermarket-trade", "description": "Pre/after-market trades",
     "used_by": ["api/v1/endpoints/intraday.py:65"], "key_fields": ["symbol", "price", "timestamp"]},

    # ── Sector ETF closes feed the rotation heatmap (via batch-quote / historical) ──
    # (sector_rotation uses get_batch_quotes + get_historical_prices, covered above)

    # ── Company info / profile / financials ──────────────────────────
    {"path": "profile", "description": "Company profile: name, sector, industry, website, employees, country",
     "used_by": ["services/market_data.py:157", "services/financials_service.py:88",
                 "api/v1/endpoints/relative_valuation.py (peer-ratios)"],
     "key_fields": ["companyName", "sector", "industry", "website", "fullTimeEmployees", "country",
                    "description", "price", "mktCap", "isEtf", "isFund"]},
    {"path": "income-statement", "description": "Quarterly/annual income statement",
     "used_by": ["services/financials_service.py:72",
                 "api/v1/endpoints/relative_valuation.py (peer-ratios: growth/margin context)"],
     "key_fields": ["date", "revenue", "netIncome", "eps", "operatingIncome", "grossProfit"]},
    {"path": "balance-sheet-statement", "description": "Quarterly/annual balance sheet",
     "used_by": ["services/financials_service.py:75"],
     "key_fields": ["date", "totalDebt", "netDebt", "cashAndCashEquivalents", "totalAssets", "totalEquity"]},
    {"path": "cash-flow-statement", "description": "Quarterly/annual cash flow statement",
     "used_by": ["services/financials_service.py:78"],
     "key_fields": ["date", "freeCashFlow", "operatingCashFlow", "capitalExpenditure"]},
    {"path": "ratios-ttm", "description": "Trailing-twelve-month financial ratios",
     "used_by": ["services/financials_service.py:81",
                 "api/v1/endpoints/relative_valuation.py (peer-ratios)"],
     "key_fields": ["peRatioTTM", "priceToEarningsRatioTTM", "priceToSalesRatioTTM",
                    "enterpriseValueMultipleTTM", "evToEBITDATTM",
                    "dividendYielTTM", "dividendPerShareTTM"]},
    {"path": "key-metrics-ttm", "description": "Trailing-twelve-month key metrics",
     "used_by": ["services/financials_service.py:84"],
     "key_fields": ["marketCapTTM", "enterpriseValueTTM", "freeCashFlowPerShareTTM"]},
    {"path": "shares-float", "description": "Outstanding/float shares (used by DCF)",
     "used_by": ["api/v1/endpoints/dcf_valuation.py:90"],
     "key_fields": ["outstandingShares", "floatShares"]},

    # ── DCF / valuation / analyst ────────────────────────────────────
    {"path": "discounted-cash-flow", "description": "Simple DCF intrinsic value",
     "used_by": ["api/v1/endpoints/dcf_valuation.py:52", "services/stock_analysis.py:248"],
     "key_fields": ["dcf", "Stock Price", "date"]},
    {"path": "levered-discounted-cash-flow", "description": "Levered DCF",
     "used_by": ["api/v1/endpoints/dcf_valuation.py:53"], "key_fields": ["dcf", "date"]},
    {"path": "custom-discounted-cash-flow", "description": "Custom-assumption DCF",
     "used_by": ["api/v1/endpoints/dcf_valuation.py:54"], "key_fields": ["dcf", "year", "revenue"]},
    {"path": "analyst-estimates", "description": "EPS/revenue/EBITDA analyst estimates",
     "used_by": ["api/v1/endpoints/stocks.py:1353", "api/v1/endpoints/dcf_valuation.py:52",
                 "api/v1/endpoints/relative_valuation.py (inputs)"],
     "key_fields": ["date", "estimatedRevenueAvg", "estimatedEpsAvg", "estimatedEbitdaAvg"]},
    {"path": "price-target-consensus", "description": "Analyst price-target consensus",
     "used_by": ["api/v1/endpoints/stocks.py:1354", "services/stock_analysis.py:249"],
     "key_fields": ["targetConsensus", "targetHigh", "targetLow", "targetMedian"]},

    # ── Ownership & SEC filings (recently broke — keep tight) ─────────
    {"path": "institutional-ownership/extract-analytics/holder",
     "description": "Top institutional 13F holders. REQUIRES year+quarter; 13F data lags ~45 days.",
     "used_by": ["api/v1/endpoints/stocks.py:1458"],
     "key_fields": ["investorName", "sharesNumber", "changeInSharesNumber", "ownership", "weight",
                    "marketValue", "date", "filingDate"]},
    {"path": "sec-filings-search/symbol",
     "description": "SEC filings by symbol over a date range; we filter S-3/424B5 dilution filings in code.",
     "used_by": ["api/v1/endpoints/stocks.py:1468"],
     "key_fields": ["formType", "filingDate", "acceptedDate", "finalLink", "link"]},

    # ── News & dividends ─────────────────────────────────────────────
    {"path": "news/stock", "description": "Latest news for a ticker",
     "used_by": ["services/market_data.py:261"],
     "key_fields": ["symbol", "title", "text", "url", "publishedDate", "site", "image"]},
    {"path": "news/stock-latest", "description": "General market news (no ticker)",
     "used_by": ["services/market_data.py:317"],
     "key_fields": ["title", "text", "url", "publishedDate", "site"]},
    {"path": "dividends", "description": "Dividend history for a ticker",
     "used_by": ["services/market_data.py:372"],
     "key_fields": ["date", "dividend", "recordDate", "paymentDate", "yield"]},

    # ── Market movers / status / calendars ───────────────────────────
    {"path": "most-actives", "description": "Most active stocks by volume (ticker tape)",
     "used_by": ["api/v1/endpoints/market.py:34"], "key_fields": ["symbol", "price", "changePercentage"]},
    {"path": "biggest-gainers", "description": "Top % gainers",
     "used_by": ["services/market_data.py:428"], "key_fields": ["symbol", "price", "changePercentage", "name"]},
    {"path": "biggest-losers", "description": "Top % losers",
     "used_by": ["services/market_data.py:471"], "key_fields": ["symbol", "price", "changePercentage", "name"]},
    {"path": "exchange-market-hours", "description": "Market open/closed status for an exchange",
     "used_by": ["api/v1/endpoints/intraday.py:34"],
     "key_fields": ["exchange", "isMarketOpen", "openingHour", "closingHour"]},
    {"path": "holidays-by-exchange", "description": "Market holidays for an exchange",
     "used_by": ["api/v1/endpoints/intraday.py:131"], "key_fields": ["date", "name"]},
    {"path": "ipos-calendar", "description": "Upcoming/recent IPO calendar",
     "used_by": ["api/v1/endpoints/stocks.py:695"], "key_fields": ["symbol", "date", "company", "priceRange"]},
    {"path": "earnings-calendar", "description": "Earnings report calendar with date range",
     "used_by": ["api/v1/endpoints/stocks.py:1029"], "key_fields": ["symbol", "date", "epsEstimated", "eps"]},

    # ── Search & screener & lists ────────────────────────────────────
    {"path": "search-name", "description": "Search companies by name",
     "used_by": ["api/v1/endpoints/stocks.py:821"], "key_fields": ["symbol", "name", "exchange"]},
    {"path": "search-symbol", "description": "Search companies by ticker symbol",
     "used_by": ["api/v1/endpoints/stocks.py:822"], "key_fields": ["symbol", "name", "exchange"]},
    {"path": "company-screener", "description": "Filter stocks/build the screener universe",
     "used_by": ["api/v1/endpoints/stocks.py:1217", "tasks/refresh_stock_snapshots.py:55"],
     "key_fields": ["symbol", "companyName", "marketCap", "sector", "price", "exchange", "isEtf", "isFund"]},
    {"path": "stock-list", "description": "Full list of tradable stocks",
     "used_by": ["tasks/fetch_daily_snapshots.py:57"], "key_fields": ["symbol", "name", "exchange"]},
    {"path": "etf-list", "description": "Full list of tradable ETFs",
     "used_by": ["tasks/fetch_daily_snapshots.py:96"], "key_fields": ["symbol", "name"]},
    {"path": "delisted-companies", "description": "Delisted symbols (paginated, used to exclude)",
     "used_by": ["tasks/fetch_daily_snapshots.py:74"], "key_fields": ["symbol", "delistedDate"]},

    # ── ETF detail ───────────────────────────────────────────────────
    {"path": "etf/info", "description": "ETF metadata (expense ratio, AUM, sectors)",
     "used_by": ["api/v1/endpoints/stocks.py:1080"],
     "key_fields": ["symbol", "expenseRatio", "aum", "isActivelyTrading", "sectorsList"]},
    {"path": "etf/holdings", "description": "Top holdings within an ETF",
     "used_by": ["api/v1/endpoints/stocks.py:1135"], "key_fields": ["asset", "name", "weightPercentage"]},

    # ── Batch quotes for other asset classes & macro ─────────────────
    {"path": "treasury-rates", "description": "Treasury yields across maturities",
     "used_by": ["api/v1/endpoints/stocks.py:285"], "key_fields": ["date", "month1", "year2", "year10", "year30"]},
    {"path": "batch-commodity-quotes", "description": "Batch commodity quotes (gold, oil, …)",
     "used_by": ["api/v1/endpoints/stocks.py:342"], "key_fields": ["symbol", "price", "changePercentage"]},
    {"path": "batch-crypto-quotes", "description": "Batch crypto quotes",
     "used_by": ["api/v1/endpoints/stocks.py:438"], "key_fields": ["symbol", "price", "changePercentage"]},
    {"path": "batch-index-quotes", "description": "Batch index quotes (S&P, Dow, Nasdaq, …)",
     "used_by": ["api/v1/endpoints/stocks.py:535"], "key_fields": ["symbol", "price", "changePercentage"]},
    {"path": "technical-indicators/sma", "description": "Simple moving averages (20/50/200)",
     "used_by": ["api/v1/endpoints/intraday.py:359"], "key_fields": ["date", "sma"]},
]


def render_registry_for_prompt() -> str:
    """Compact text rendering of the registry for inclusion in the Claude prompt."""
    lines: list[str] = []
    for e in FMP_ENDPOINTS:
        fields = ", ".join(e.get("key_fields") or []) or "—"
        used = "; ".join(e.get("used_by") or []) or "—"
        lines.append(
            f"- `{e['path']}` — {e['description']}\n"
            f"    used by: {used}\n"
            f"    fields read: {fields}"
        )
    return "\n".join(lines)
