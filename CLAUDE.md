# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000   # dev server at :8000
python migration_runner.py                  # run Alembic migrations manually
python -m app.tasks.fetch_daily_snapshots   # run snapshot cron job manually
```

### Frontend
```bash
cd frontend
npm install
npm start        # dev server at :3000
npm test         # jest tests
npm run build    # production build
```

### Database / Infrastructure
```bash
docker-compose up -d   # PostgreSQL (:5432)
```

API docs: `http://localhost:8000/api/v1/docs`

---

## Architecture

**Stack:** React 19 + TypeScript → FastAPI (async) → PostgreSQL (asyncpg). External: FMP (market data), Stripe (payments), Postmark (email), Anthropic (AI). No SMS: Twilio and the phone/OTP flow were removed 2026-10-30.

### Backend (`backend/app/`)

**Entry point** — `main.py` lifespan initializes the persistent FMP httpx client, loads alert tickers, starts the WebSocket price-streaming service, and wires `alert_checker` into the price stream. All routers are registered here under `/api/v1/`.

**Router layout** (`api/v1/endpoints/`):
| File | Prefix | Notes |
|---|---|---|
| `auth.py` | `/auth` | register, login, verify-email, password reset, change-password |
| `stocks.py` | `/stocks` | quotes, historical, news, daily-snapshot, dashboard cards, IPOs, ownership, search |
| `stock_analysis.py` | `/stocks/...` (mounted at `/api/v1`) | AI analysis, price forecast, AI financials |
| `screener.py` | `/screener` | the stock screener and saved screens |
| `watchlist.py` | `/watchlist` | CRUD, tier-gated count |
| `portfolio.py` | `/portfolio` | CRUD |
| `portfolio_analysis.py` | `/portfolio` | AI portfolio analysis |
| `alerts.py` | `/alerts` | price alerts (email) |
| `technical_alerts.py` | `/technical-alerts` | JSONB config per alert type |
| `technical_analysis.py` | `/technical-analysis` | indicator calculations, ATR risk levels, watchlist screen presets |
| `dcf_valuation.py` | `/dcf` | `/suggestions/{ticker}` + `/calculate/{ticker}` |
| `relative_valuation.py` | `/relval` | peer multiples |
| `financials.py` | `/financials` | full company financials payload |
| `market.py` | `/market` | market-wide data |
| `sector_rotation.py` | `/sector-rotation` | sector heatmap |
| `live_prices.py` | `/live-prices` | the live-price WebSocket |
| `content.py` | `/content` | blogs, tutorials, admin content |
| `stripe_payments.py` | `/stripe` | subscription create/cancel/status, webhooks |
| `intraday.py` | `/intraday` | bars + MA overlay, batch quotes |
| `sitemap.py` | `/sitemap.xml` (root, not `/api/v1`) | served on the site's own host through `frontend/server.js` |

**Auth and the paywall** (`api/dependencies.py`; tokens made in `core/security.py`): HS256 JWT, 90-min expiry. `get_current_user` is the default dependency for every protected route and **enforces the subscription**: 402 without a live one, decided from the stored state (never a Stripe call). `get_current_user_any_subscription` is only for the routes someone without a live subscription needs (`/auth/me`, `/auth/change-password`, `/stripe/subscription-status`, create-subscription, start-trial, billing portal, cancel). Who has access is one rule in `core/entitlements.py`: account enabled (`is_active`) and subscription `active`/`trialing`, or an exempt account (admins, the demo account). `has_app_access()` and its SQL twin `app_access_clause()` back the dependency, the live-price WebSocket and both alert checkers. `stocks.py` and `intraday.py` attach the dependency at router level, so a new route there is covered. The frontend's `SubscriptionGuard` only routes people (to `/billing` or `/payment`); it is not the paywall.

**Tier gating** (`core/tier_limits.py`): Four tiers — `beginner`, `casual`, `active`, `professional`. `TIER_LIMITS` holds every limit: counts (watchlist, portfolio, alerts, indicator alerts, saved screens), read with `get_tier_limit()` before an insert, and metered features (DCF, RelVal, TA, watchlist screens, AI) per the tier's `review_period` (week or day). Metered usage lives in the `FeatureUsage` table and goes through `core/usage_limits.py`: `await check_feature_limit(user, db, feature, label, unit)` before the work (429 with an upgrade prompt that compares tiers by `weekly_equivalent()`, since periods differ), `await record_feature_usage(user, db, feature)` after it succeeds. The frontend mirror is `data/pricingTiers.ts` (see Patterns).

**Database** (`db/`): All models use UUID PKs and `TIMESTAMPTZ`. Session via `get_db()` dependency (async). Alembic migrations auto-run at startup through `migration_runner.py` — `alembic upgrade head` waits for DB availability first.

**Key models** (`db/models.py`):
- `User` — tier, stripe_customer_id, is_active (account enabled; **not** a subscription flag), and the subscription state copied from Stripe: `subscription_status`, `stripe_subscription_id`, `trial_end`, `current_period_end`, `cancel_at_period_end`, `has_had_trial`, `subscription_synced_at` (migration 037)
- `PriceAlert` — condition (above|below), triggered_at
- `TechnicalAlert` — config JSONB, last_state JSONB
- `FeatureUsage` — per-user/per-feature daily or weekly counter
- `DailyStockSnapshot` — ticker, open/close/change_pct, snapshot_date, asset_type (CS|ETF)

**Services** (`services/`):
- `fmp_client.py` — persistent `httpx.AsyncClient`, base `https://financialmodelingprep.com/stable/`. All market data flows through here. The env var for the API key is `FMP_API_KEY`.
- `market_data.py` — `_fmp_get()` is the one FMP request path for everything except the universe build and the daily-snapshot cron; no endpoint calls `get_fmp_client()` directly. It retries a 429 three times with backoff (honouring `Retry-After`), then raises. **A failed fetch is skipped, never stored**: `get_dividends` flags one with `fetch_failed` so the screener's dividend pass leaves the row untouched rather than writing "none" (a 2026-10-25 throttling burst had rewritten 2,186 payers as non-payers that way). Pass summaries print skipped/throttled counts. It also raises `FMPError` when FMP answers 200 with an `{"Error Message": ...}` body (how an endpoint outside the plan answers), so that is a failure, never empty data. Quoting a list of symbols always goes through `get_quote_rows()`: batch-quote when `FMP_BATCH_ENDPOINTS` is on, one `/quote` per symbol (5 at a time) when off. With it off, the dashboard cards and exchange rates quote symbol by symbol too, extended-hours fields stay empty, the live feed polls every 60s (120s for alert-only tickers), and the whole-market jobs (screener refresh, daily snapshot cron) skip, leaving their last stored data. A failed fetch in an endpoint is an error or an `unavailable` entry, never an empty result: `/stocks/ipos` and `/stocks/ownership/{t}` list a failed part in `unavailable` and still return the rest.
- `core/redaction.py` — **FMP and FRED keys ride in URLs, and httpx error text quotes the URL.** Show or log an exception only through `safe_error(e)`, use `print_redacted_exc()` instead of `traceback.print_exc()`, and redact other text with `redact()`. `install_log_redaction()` (called in `main.py` and in every task's `__main__`) redacts every log record and the uncaught-exception hook as a safety net, not a substitute. `python -m app.core.redaction --selftest`.
- `core/listings.py` — **the one definition of a US-listed common stock**: `US_EXCHANGES`, `is_us_exchange()` (accepts NYSEARCA/NYSEAMERICAN/BATS aliases), `is_us_symbol()` and `is_common_stock()`. Pure (no settings import) because the daily-snapshot cron imports it. Used by the universe build, the daily cron, gainers/losers, the ticker tapes and the IPO calendar; don't write another junk-ticker filter. `python -m app.core.listings --selftest`.
- `financials_service.py` — assembles the full financials payload; derives DCF suggestions including YoY revenue growth (date-based matching, not index-based) and a 20% conservative haircut on the suggested growth rate. Its statement fetches go through `_fmp_get`; a statement that fails to load is listed in the payload's `unavailable` (`income_statement`, `balance_sheet`, `cash_flow`). Every consumer must treat a non-empty `unavailable` as "try again" (503, or skip for alerts), never as "this company has none" and never compute around the gap.
- `email_service.py` — **the single outbound email path.** Every email (verification, password reset, payment, alerts) goes through `EmailService.send_email()`, which posts to Postmark and returns `bool`. It is synchronous by design: async callers wrap it in `asyncio.to_thread`. Never construct a provider client elsewhere — route new email through here so there stays one place to swap providers.
- `alert_checker.py` — subscribes to the WebSocket price stream; on each tick, checks `PriceAlert` rows and triggers an email when crossed. **Alerts are one-shot**, so `triggered_at`/`is_active=False` is only set once a notification actually reached the user; if every channel fails the alert stays armed and retries after `NOTIFY_RETRY_SECONDS`. `technical_alert_checker.py` does the same by holding `last_state` at its pre-transition value. Which tickers the feed polls for alerts comes from the database: `refresh_alert_tickers` runs at startup and every 5 minutes (main.py's scheduler) and makes the feed's alert tickers exactly those of armed alerts whose owners have access; creating or resuming an alert also subscribes its ticker at once (`subscribe_new_alert_ticker`).
- `websocket_service.py` — manages per-ticker subscriber lists; broadcasts price ticks to connected frontend clients.
- `technical_indicators.py` — hand-rolled pandas/numpy calculations (RSI, MACD, Bollinger Bands, etc.). **No TA-Lib** — there is no such dependency; don't reach for it. CPU-bound; called via `/technical-analysis/analyze/{ticker}`. Each indicator exists once: `calculate_*_series` gives the history and `calculate_*` is its last bar, and the TA page, screens, AI reads and alerts all use them over the same window, `INDICATOR_HISTORY_DAYS`. Never recompute an indicator in an endpoint.
  `calculate_atr_risk_levels` is the chandelier exit (22-bar high − 3×ATR, and the short mirror) backing the ATR stop calculator. It is **entry-independent by design**: everything that depends on a user-supplied entry price (fixed stop, R-multiples, share count) lives in `components/AtrRiskLevels.tsx` so it recomputes on keystroke without a refetch and the formula exists in exactly one language. Don't add a server-side entry price. `lookback` is never shrunk to fit a short series — too few bars returns `None` and the UI says why.
  Pure and offline-testable: `python -m app.services.technical_indicators --selftest`.
- `stock_analyzer.py` — Anthropic API calls for AI price targets and company analysis.
- `subscription_sync.py` — **the only writer of a user's subscription fields** (status, tier, trial/period dates). Stripe is the authority: webhooks, the billing endpoints, `/stripe/subscription-status` and a reconcile job (in-process scheduler: at startup, which backfills anyone never synced, then every 6h) all re-read the customer's subscriptions from Stripe (`sync_user`, `sync_customer`) instead of trusting an event payload, so late, duplicate or out-of-order events are harmless. The tier follows the price only while the subscription is active/trialing; an unknown price keeps the tier and logs an error (update the `STRIPE_*_PRICE_ID` settings whenever a Stripe price changes). Every stripe-python call goes through `stripe_call()` (a worker thread). Never set `subscription_status` or `subscription_tier` anywhere else.
- `edgar_client.py` — **the single place that talks to sec.gov / data.sec.gov.** Owns one lifespan-managed httpx client, one 8 req/sec throttle and one `SEC_USER_AGENT` (SEC returns 403 without a UA naming the app and a contact email). Its limit is per-IP, so every EDGAR reader must share this throttle rather than keep its own. Use `edgar_get()`; it returns 404s as a data condition and raises `PermissionError` on 403.
- `edgar_identity.py` — **entity identity, resolved once and gated everywhere.** A ticker is a mutable label; FMP keys on the label, so it can serve one entity's filings under another's symbol (confirmed for `TE`). CIK is the identity and EDGAR is the authority. `get_company_financials` resolves the ticker through `resolve_ticker_cik()` in the same `asyncio.gather` as the FMP calls and attaches one verdict as `entity_trust`. Tri-state: `match` proceeds, `contradiction` is a hard block, `cannot_resolve` **never blocks** (funds/ETFs are absent from `company_tickers.json` and new registrants lag it). On a contradiction the service nulls every entity-scoped key (`_ENTITY_SCOPED_KEYS`) at source, so all consumers suppress together. Never re-derive identity in a consumer — inconsistent enforcement is how a wrong-entity warning once rendered beside green "actual data" badges. Pure logic (`normalize_cik`, `build_entity_trust`) is importable with no config: `python -m app.services.edgar_identity --selftest`.
- `edgar_identity.py` verdicts are **four**, not three: `match` and `cannot_resolve` and `contradiction` as described, plus `successor_registrant` — a CIK mismatch where the vendor's CIK is the *predecessor* of the same business (a reorganization or change of domicile mints a new CIK; TE is FREYR Battery → T1 Energy). Successors present predecessor financials, so this does **not** block; `is_contradicted()` is deliberately False for it and only the banner changes. `resolve_contradiction()` tells succession from genuine reuse using EDGAR's `formerNames` on the submissions record, and runs only on the contradiction path. Data *age* is a separate axis — `date_stale` in `financials_service` covers "these figures predate the reorganization".
- Funds: SEC splits tickers across two files unevenly. SPY, GLD, USO and QQQ file as trusts/LPs and appear in `company_tickers.json`, so they keep the real CIK comparison; ULTY, VOO, JEPI, ARKK and IWM appear only in `company_tickers_mf.json`. `resolve_fund_ticker()` detects the latter, and when a ticker is a known fund with no operating CIK the vendor-vs-vendor fallback is **skipped** — otherwise two disagreeing FMP CIKs hard-block an ETF page with a "Wrong Company" banner.
- `sec_filings.py` owns the submissions endpoint and the one app-wide cache for it (`fetch_submissions_cached`, 6h TTL) — identity classification, the IPO filter and the bankruptcy check all read the same records. `is_new_issuer(ticker, listing_date)` backs `/stocks/ipos`: vendor IPO calendars also carry exchange transfers, uplistings and relistings, and OPAD's NYSE→Nasdaq move surfaced as an "IPO" for a company public since its 2021 SPAC merger. The discriminator is the registrant's filing history, not the paperwork — a transfer files `8-A12B` exactly like a new listing. Every check **fails open**: dropping a real IPO is worse than showing a stale one.
- `edgar_dividends.py` — EDGAR XBRL dividends-per-share reader, the source-of-record half of dividend verification. Not yet wired into any endpoint. Resolves identity via `edgar_identity`, not its own lookup.
- `valuation_check.py` — **the one rule for whether FMP's `ratios-ttm` multiples may be shown.** FMP's P/E must agree within 2x with dollar market cap over TTM net income converted at the day's rate, or the row's price multiples are withheld. The screener pass, `financials_service` and RelVal's `/peer-ratios` all use it, so a P/E the screener blanks is blank on the company page, in the DCF, and in RelVal for both the subject and its peers' medians. Pass a **dollar** market cap (batch-quote or `profile`), never `key-metrics-ttm`'s, which is in the reporting currency for foreign filers. `python -m app.services.valuation_check --selftest`. Its `vendor_per_share_ok` is the rule for FMP's per-share vendor values (its own DCF, the analyst price-target consensus): shown or fed to the AI only for dollar reporters and within 4x of the price.
- `fx.py` — **the one place exchange rates are fetched and applied. Everything the app shows is in US dollars.** FMP's statements, key-metrics-ttm and analyst estimates arrive in the company's reporting currency (Toyota: yen, TSM: Taiwan dollars), with no currency field on estimates. `financials_service` converts its statement rows (`rows_to_usd`) and estimates (`analyst_estimates.estimates_to_usd`) once, at today's rate, before deriving anything — so the DCF, RelVal, the Financials panel and the AI read all get dollars, and growth and margins stay exactly as reported. RelVal and `/stocks/analyst-estimates` convert their own estimate fetches the same way. The only historical-rate conversion is the quarterly trailing P/E (`get_fx_history`), because it divides by a dollar close on each quarter's date. Shares are never converted: FMP reports ADR issuers' share counts and EPS per depositary share. No rate means a blank, never an unconverted figure, and an unknown currency is no rate: `usd_rate(None)` is None, so estimates whose reporting-currency lookup failed go blank. Only statement rows with no `reportedCurrency` are taken as dollars (`rows_to_usd`). FMP's own `discounted-cash-flow` value and `price-target-consensus` are NOT converted: they are per-share and their basis varies by company (Toyota's read as dollars; Sabesp's sit ~5x its price, which fits either unconverted reais or a stale pre-split basis — its dividends show a ~5:1 adjustment), so they can't be rescaled safely. `python -m app.services.fx --selftest`.

**Cron** (`tasks/fetch_daily_snapshots.py`): Scheduled externally (Railway cron). Fetches full batch quote from FMP, filters out delisted/foreign/long-ticker names and (ETFs aside) non-common instruments via `core/listings.py`, classifies ETF vs CS, then wipes and reloads `DailyStockSnapshot` (one day only, not history).

**Screener universe** (`tasks/refresh_stock_snapshots.py`, in-process APScheduler every 15 min, daily rebuild on the first run of a trading day): defined as **listed on a US exchange**, queried with `exchange=` derived from `US_EXCHANGES` (`core/listings.py`). Never `country=US` — FMP's country is domicile, and it silently dropped ~1,400 US-listed foreign companies (TSM, ASML, Accenture, Linde). ADRs are common stock here. The stock leg of `/company-screener` also carries warrants, SPAC units and rights, preferreds, baby bonds and trust certificates, often listed at the parent's market cap. `is_common_stock()` (`core/listings.py`) drops them at the universe build by symbol shape (Nasdaq fifth-letter U/W, dash suffixes) and name; `python -m app.tasks.refresh_stock_snapshots --selftest` covers it. Valuation multiples from `ratios-ttm` are stored NULL when non-positive **or below a floor** (`_PE_FLOOR` 1, `_PB_FLOOR` 0.1, `_EV_EBITDA_FLOOR` 1): below that they were one-off gains, mis-scaled book values and negative-over-negative artifacts, and they led every ascending sort. Don't lower the floors to "keep more data"; the vendor figures there are not valuations. On top of the floors, every row passes `valuation_check` (`services/valuation_check.py`, shared with `financials_service`): FMP's P/E must agree within 2x with market cap over TTM net income (`income-statement-ttm`) converted at the day's rate (`batch-forex-quotes`), or all three multiples are stored NULL. FMP leaves some foreign filers' earnings unconverted (Sabesp at a P/E of 2 against a true 15) and gets some domestic ones wrong too (Biogen 1.7). Suppress, don't caveat.

### Frontend (`frontend/src/`)

**Entry** — `App.tsx` wraps protected routes in `SubscriptionGuard` (checks JWT + Stripe active/trialing status; redirects to `/payment` if inactive) and `LivePriceProvider` (persistent WebSocket, shared across all pages).

**API client** (`services/api.ts`): **every backend call goes through it**; no page imports axios for a request or builds an API URL or auth header (`axios.isAxiosError` and types are fine). Axios instance with `baseURL = {REACT_APP_API_URL}/api/v1`. A request interceptor injects `Authorization: Bearer {token}` from `localStorage.access_token` on every request, public endpoints included, so a public endpoint must never reject a stale or invalid token. `API_BASE_URL` is the one exported base URL, only for what can't use the instance (the live-price WebSocket). Exports named groups: `authAPI`, `stocksAPI`, `watchlistAPI`, `portfolioAPI`, `alertsAPI`, `technicalAPI`, `dcfAPI`, `stripeAPI`, `intradayAPI`, `blogAPI`, `tutorialsAPI`, `adminContentAPI`, etc. `intradayAPI.getBatch` is the only caller of `/intraday/batch`; index its rows with `quotesByTicker` and check `price`. A position's value and P/L at a price is `deriveValues` in `utils/portfolioTotals.ts`.

**`frontend/server.js`** (Node, serves the build): OG/prerender pages for blog posts, 301s for retired paths (`/waitlist`, `/termsconditions`, `/privacypolicy`, `/payment-success`), and `/sitemap.xml`, which it fetches from the backend (`OG_API_BASE`) and serves from the site's own host, answering 503 with `Retry-After` rather than an empty or partial sitemap.

**Sign-ups:** `NEW_SIGNUPS_OPEN` in `data/pricingTiers.ts` is **false while the project is paused (since 2026-10-31)**. It hides every public sign-up button and link (Landing nav and hero, the pricing cards, the Pricing page's buttons and Sign Up link for logged-out visitors, Login's two links, the FAQ/Terms/Privacy "Get Started"); `/register` still works by direct URL and logged-in users keep their plan-change buttons. Any new sign-up CTA must check it. Set it true on relaunch.

**Key pages:**
- `Stocks.tsx` — stock screener backed by `stock_snapshots` (`StockSnapshot`, refreshed by `tasks/refresh_stock_snapshots.py`) through `/screener`; includes Price History chart (Chart.js with 50/200-day MA overlays)
- `TechnicalAnalysis.tsx` — Chart.js line/bar indicator panels (the intraday VWAP modal uses Recharts)
- `DCFValuation.tsx` — calls `/dcf/suggestions/{ticker}` then `/dcf/calculate/{ticker}`
- `Dashboard.tsx` — live-price watchlist summary, market overview
- `Payment.tsx` — Stripe Elements form, lazy-loaded

**Charting:** Two libraries in use — **Chart.js** (`react-chartjs-2`) for daily Price History on `Stocks.tsx`, the indicator panels on `TechnicalAnalysis.tsx` and the landing demo card; **Recharts** for the intraday chart (`components/ScreenerChartPanel.tsx`, opened from Stocks, Watchlist and Portfolio and open to every plan), the TA page's VWAP modal, `DCFValuation.tsx` and `SectorHeatmap.tsx`. One library per chart component; a new chart follows its kind (daily/indicator charts Chart.js, intraday Recharts).

**Theme:** Tailwind dark mode via `ThemeContext`. Dark variant: `dark:bg-gray-800`, `dark:text-white`. Teal accent: `#0d9488` / `teal-600`.

---

## Environment Variables

### Backend (`.env`)
```
DATABASE_URL=postgresql+asyncpg://...
SECRET_KEY=
FMP_API_KEY=          # FMP API key
FMP_BATCH_ENDPOINTS=false  # true only when the FMP plan includes batch endpoints (off since the
                           # 2026-10-31 downgrade). Set it on the backend AND the daily-snapshot cron.
ANTHROPIC_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_BEGINNER_PRICE_ID= / CASUAL / ACTIVE / PROFESSIONAL
POSTMARK_SERVER_TOKEN=     # Postmark *Server* token (not the Account token)
POSTMARK_MESSAGE_STREAM=outbound-1 # this server's transactional stream; never a broadcast stream
FROM_EMAIL=                # default sender — alert emails
SUPPORT_EMAIL=             # verification, password reset, payment-failed
SALES_EMAIL=               # payment success, trial ending
FROM_NAME=NWC-Analytics
AUDIT_ALERT_EMAIL=         # weekly FMP field-audit recipient; falls back to SUPPORT_EMAIL
SEC_USER_AGENT=            # SEC requires app name + real contact email, else 403.
                           # Defaults to "NWC-Analytics/1.0 (support@nwc-analytics.com)"
FRONTEND_URL=https://nwc-analytics.com   # no trailing slash; override locally if running a dev frontend
ACCESS_TOKEN_EXPIRE_MINUTES=90
```

> All four sender addresses default to `""`. If unset, every outbound email fails
> with "no sender address configured" — the app boots fine and only fails at send
> time. `get_settings()` echoes the resolved values at startup.

### Frontend (`.env.local`)
```
REACT_APP_API_URL=http://localhost:8000
```

---

## Patterns to Follow

- **New backend endpoint**: add router file in `api/v1/endpoints/`, register in `main.py`, add Pydantic schemas in `schemas/`.
- **New DB table**: add SQLAlchemy model in `db/models.py`, create Alembic migration (`alembic revision --autogenerate -m "description"` from `backend/`), migration auto-runs at next startup.
- **Tier-gating a feature**: add its limit to `TIER_LIMITS` and its mirror to `PlanLimits` in `data/pricingTiers.ts`. Backend: `await check_feature_limit(user, db, "feature", label, unit)` before the work, `await record_feature_usage(user, db, "feature")` after it succeeds (`core/usage_limits.py`); counts use `get_tier_limit()`. Frontend: gate with `planIncludes(tier, feature)`, read limits with `getTierLimits(tier)`, and take tier order from `TIER_ORDER`/`tierRank`/`toTierSlug`, all from `pricingTiers.ts`; no page keeps its own limits, plan names or tier list. The Options Calculator gate (`optionsCalculator`) is frontend-only by design: it is client-side math with no endpoint of its own.
- **Plan names and prices**: backend text (emails, Stripe metadata, messages) takes plan names from `tier_limits.get_plan_name()`; the frontend from `data/pricingTiers.ts`. Keep the two name lists, and the limits, identical: `src/data/pricingTiers.test.ts` reads `tier_limits.py` and fails on any difference (`CI=true npx react-scripts test --watchAll=false src/data/pricingTiers.test.ts` from `frontend/`). An email states a price only from the Stripe subscription's own price (`stripe_payments._price_label`), never a hard-coded amount.
- **Displaying any per-company financial figure**: gate it on the `entity_trust` verdict already on the payload — backend `is_contradicted(...)` from `edgar_identity`, frontend `isEntityContradicted(...)` from `services/api.ts` with the shared `<EntityTrustBlock>`. Suppress, do not caveat: a soft warning next to an affirmative green badge loses to the badge. Do not resolve identity yourself. Every money figure on the payload is **US dollars**, converted at source (see `fx.py`); `usd_conversion` says what it was converted from, and the Financials panel shows that note. Format money with `formatUsd` from `utils/currency.ts`. Any new source of company money figures (a new FMP statement or estimates endpoint) must go through `fx` before it reaches a consumer.
- **New frontend API call**: add a method to the appropriate named group in `services/api.ts` (pages never call axios directly); consume in the component via `useEffect` + state.
- **Protected route**: wrap component in `SubscriptionGuard` in `App.tsx` and add `Depends(get_current_user)` on the backend endpoint (that is what enforces the subscription).
- **A Claude-backed feature**: check the tier before any cache read (`_require_ai_tier`), serve cache hits free, meter misses against `ai_analysis` (`check_ai_analysis_access`, then `record_feature_usage` once the result exists), and call it only on an explicit click in the UI, never on page load. `/stocks/{t}/ai-financials` and `/stocks/{t}/price-forecast` are the models.
