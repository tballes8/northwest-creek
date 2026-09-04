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

**Stack:** React 19 + TypeScript → FastAPI (async) → PostgreSQL (asyncpg). External: FMP (market data), Stripe (payments), Postmark (email), Twilio (SMS), Anthropic (AI).

### Backend (`backend/app/`)

**Entry point** — `main.py` lifespan initializes the persistent FMP httpx client, loads alert tickers, starts the WebSocket price-streaming service, and wires `alert_checker` into the price stream. All routers are registered here under `/api/v1/`.

**Router layout** (`api/v1/endpoints/`):
| File | Prefix | Notes |
|---|---|---|
| `auth.py` | `/auth` | register, login, verify-email, password reset |
| `stocks.py` | `/stocks` | quotes, historical, news, daily-snapshot, AI analysis |
| `watchlist.py` | `/watchlist` | CRUD, tier-gated count |
| `portfolio.py` | `/portfolio` | CRUD |
| `alerts.py` | `/alerts` | price alerts, SMS support |
| `technical_alerts.py` | `/technical-alerts` | JSONB config per alert type |
| `technical_analysis.py` | `/technical-analysis` | TA-Lib calculations |
| `dcf_valuation.py` | `/dcf` | `/suggestions/{ticker}` + `/calculate/{ticker}` |
| `financials.py` | `/financials` | full company financials payload |
| `stripe_payments.py` | `/stripe` | subscription create/cancel/status |
| `intraday.py` | `/intraday` | bars + MA overlay |
| `phone.py` | `/phone` | OTP verification for SMS alerts |

**Auth** (`core/security.py`): HS256 JWT, 90-min expiry. `get_current_user()` FastAPI dependency validates token and returns `User`. Dependency used as `Depends(get_current_user)` in protected routes.

**Tier gating** (`core/tier_limits.py`): Four tiers — `beginner`, `casual`, `active`, `professional`. Limits defined per-tier for watchlist size, alert count, weekly DCF/analysis usage, SMS access. Usage tracked in `FeatureUsage` table (resets daily or weekly). Check with `can_use_feature()` / `can_add_watchlist_stock()` before mutating.

**Database** (`db/`): All models use UUID PKs and `TIMESTAMPTZ`. Session via `get_db()` dependency (async). Alembic migrations auto-run at startup through `migration_runner.py` — `alembic upgrade head` waits for DB availability first.

**Key models** (`db/models.py`):
- `User` — tier, stripe_customer_id, phone verification fields
- `PriceAlert` — condition (above|below), sms_enabled, triggered_at
- `TechnicalAlert` — config JSONB, last_state JSONB
- `FeatureUsage` — per-user/per-feature daily or weekly counter
- `DailyStockSnapshot` — ticker, open/close/change_pct, snapshot_date, asset_type (CS|ETF)

**Services** (`services/`):
- `fmp_client.py` — persistent `httpx.AsyncClient`, base `https://financialmodelingprep.com/stable/`. All market data flows through here. The env var for the API key is `MASSIVE_API_KEY`.
- `financials_service.py` — assembles the full financials payload; derives DCF suggestions including YoY revenue growth (date-based matching, not index-based) and a 20% conservative haircut on the suggested growth rate.
- `email_service.py` — **the single outbound email path.** Every email (verification, password reset, payment, alerts) goes through `EmailService.send_email()`, which posts to Postmark and returns `bool`. It is synchronous by design: async callers wrap it in `asyncio.to_thread`. Never construct a provider client elsewhere — route new email through here so there stays one place to swap providers.
- `alert_checker.py` — subscribes to the WebSocket price stream; on each tick, checks `PriceAlert` rows and triggers email + SMS when crossed. **Alerts are one-shot**, so `triggered_at`/`is_active=False` is only set once a notification actually reached the user; if every channel fails the alert stays armed and retries after `NOTIFY_RETRY_SECONDS`. `technical_alert_checker.py` does the same by holding `last_state` at its pre-transition value.
- `websocket_service.py` — manages per-ticker subscriber lists; broadcasts price ticks to connected frontend clients.
- `technical_indicators.py` — TA-Lib based calculations (RSI, MACD, Bollinger Bands, etc.). CPU-bound; called via `/technical-analysis/analyze/{ticker}`.
- `stock_analyzer.py` — Anthropic API calls for AI price targets and company analysis.
- `edgar_client.py` — **the single place that talks to sec.gov / data.sec.gov.** Owns one lifespan-managed httpx client, one 8 req/sec throttle and one `SEC_USER_AGENT` (SEC returns 403 without a UA naming the app and a contact email). Its limit is per-IP, so every EDGAR reader must share this throttle rather than keep its own. Use `edgar_get()`; it returns 404s as a data condition and raises `PermissionError` on 403.
- `edgar_identity.py` — **entity identity, resolved once and gated everywhere.** A ticker is a mutable label; FMP keys on the label, so it can serve one entity's filings under another's symbol (confirmed for `TE`). CIK is the identity and EDGAR is the authority. `get_company_financials` resolves the ticker through `resolve_ticker_cik()` in the same `asyncio.gather` as the FMP calls and attaches one verdict as `entity_trust`. Tri-state: `match` proceeds, `contradiction` is a hard block, `cannot_resolve` **never blocks** (funds/ETFs are absent from `company_tickers.json` and new registrants lag it). On a contradiction the service nulls every entity-scoped key (`_ENTITY_SCOPED_KEYS`) at source, so all consumers suppress together. Never re-derive identity in a consumer — inconsistent enforcement is how a wrong-entity warning once rendered beside green "actual data" badges. Pure logic (`normalize_cik`, `build_entity_trust`) is importable with no config: `python -m app.services.edgar_identity --selftest`.
- `edgar_identity.py` verdicts are **four**, not three: `match` and `cannot_resolve` and `contradiction` as described, plus `successor_registrant` — a CIK mismatch where the vendor's CIK is the *predecessor* of the same business (a reorganization or change of domicile mints a new CIK; TE is FREYR Battery → T1 Energy). Successors present predecessor financials, so this does **not** block; `is_contradicted()` is deliberately False for it and only the banner changes. `resolve_contradiction()` tells succession from genuine reuse using EDGAR's `formerNames` on the submissions record, and runs only on the contradiction path. Data *age* is a separate axis — `date_stale` in `financials_service` covers "these figures predate the reorganization".
- Funds: SEC splits tickers across two files unevenly. SPY, GLD, USO and QQQ file as trusts/LPs and appear in `company_tickers.json`, so they keep the real CIK comparison; ULTY, VOO, JEPI, ARKK and IWM appear only in `company_tickers_mf.json`. `resolve_fund_ticker()` detects the latter, and when a ticker is a known fund with no operating CIK the vendor-vs-vendor fallback is **skipped** — otherwise two disagreeing FMP CIKs hard-block an ETF page with a "Wrong Company" banner.
- `edgar_dividends.py` — EDGAR XBRL dividends-per-share reader, the source-of-record half of dividend verification. Not yet wired into any endpoint. Resolves identity via `edgar_identity`, not its own lookup.

**Cron** (`tasks/fetch_daily_snapshots.py`): Scheduled externally (Railway cron). Fetches full batch quote from FMP, filters out delisted/foreign/long-ticker names, classifies ETF vs CS, upserts into `DailyStockSnapshot`.

### Frontend (`frontend/src/`)

**Entry** — `App.tsx` wraps protected routes in `SubscriptionGuard` (checks JWT + Stripe active/trialing status; redirects to `/payment` if inactive) and `LivePriceProvider` (persistent WebSocket, shared across all pages).

**API client** (`services/api.ts`): Axios instance with `baseURL = {REACT_APP_API_URL}/api/v1`. A request interceptor injects `Authorization: Bearer {token}` from `localStorage.access_token`. Exports named groups: `authAPI`, `stocksAPI`, `watchlistAPI`, `portfolioAPI`, `alertsAPI`, `technicalAPI`, `dcfAPI`, `stripeAPI`, `intradayAPI`, etc.

**Key pages:**
- `Stocks.tsx` — stock screener backed by `DailyStockSnapshot`; includes Price History chart (Chart.js with 50/200-day MA overlays)
- `TechnicalAnalysis.tsx` — Recharts-based candlestick + indicator panels
- `DCFValuation.tsx` — calls `/dcf/suggestions/{ticker}` then `/dcf/calculate/{ticker}`
- `Dashboard.tsx` — live-price watchlist summary, market overview
- `Payment.tsx` — Stripe Elements form, lazy-loaded

**Charting:** Two libraries in use — **Chart.js** (`react-chartjs-2`) for Price History on `Stocks.tsx`; **Recharts** for technical analysis charts. Don't mix them on the same page.

**Theme:** Tailwind dark mode via `ThemeContext`. Dark variant: `dark:bg-gray-800`, `dark:text-white`. Teal accent: `#0d9488` / `teal-600`.

---

## Environment Variables

### Backend (`.env`)
```
DATABASE_URL=postgresql+asyncpg://...
SECRET_KEY=
MASSIVE_API_KEY=          # FMP API key
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
TWILIO_ACCOUNT_SID= / AUTH_TOKEN / FROM_NUMBER
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
- **Tier-gating a feature**: call `can_use_feature(db, user, "feature_name")` before the operation; increment with `increment_feature_usage()` after success.
- **Displaying any per-company financial figure**: gate it on the `entity_trust` verdict already on the payload — backend `is_contradicted(...)` from `edgar_identity`, frontend `isEntityContradicted(...)` from `services/api.ts` with the shared `<EntityTrustBlock>`. Suppress, do not caveat: a soft warning next to an affirmative green badge loses to the badge. Do not resolve identity yourself.
- **New frontend API call**: add method to the appropriate named group in `services/api.ts`; consume in the component via `useEffect` + state.
- **Protected route**: wrap component in `SubscriptionGuard` in `App.tsx` and add `Depends(get_current_user)` on the backend endpoint.
