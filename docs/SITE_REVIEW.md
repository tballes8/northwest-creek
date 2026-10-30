# NWC-Analytics Site Review

Started 2026-10-30, ahead of paid ads on Reddit, Google and Bing. **Feature freeze in effect:** no enhancements until every blocker and high is fixed or consciously accepted.

## How to read this

- **Severity:** `blocker` (fix before ads run) · `high` · `medium` · `low`
- **Status:** `open` · `fixed` · `won't fix` (with reason)
- **Verified:** `code` means checked against the source by Claude. `runtime` means it only shows up by using the live site (see section 6).

Findings come from five read-only reviews (areas 1–5). Each finding was re-checked against the code before going on this list.

## Launch blockers

The review produced **16 blockers**, and **about 50 high** findings across the five areas. Counts by area: claims 32, money path 35, dead code 37, data 34, security 26. Many duplicate each other across areas; the IDs cross-reference them.

**Do this weekend (time-sensitive):**
- **N11:** in the Railway dashboard, change `check-technical-alerts` from `30 20` to `30 21 * * 1-5` UTC before Mon Nov 2 (daylight saving ends Nov 1), and check `compute_squeeze`'s schedule.

**Stop the bleeding (abuse and cost, all small):**
- **S1:** unmount the unused SMS/phone router (unlimited texts at your Twilio cost).
- **S3:** authenticate and validate the price WebSocket (one message silences every alert).
- **S2:** escape the email HTML, whitelist the tier, rate-limit register and forgot-password (a phishing relay through your sender).
- **S4:** keep reset and verify tokens out of analytics and pixels.

**The money path (the biggest piece of work; these are linked):**
- **M1:** locked accounts can't come back.
- **M2:** past-due users are pushed into a second subscription.
- **M3:** there's no way to update a card.

These, together with M4–M8 (webhook retries, trial-before-card, upgrades, server-side subscription enforcement), share one root cause: subscription state lives in Stripe calls and the browser, not on the User row. **Fix them as one design change**: store the Stripe status on User from webhooks, enforce it server-side, add a Billing Portal, stop using `is_active` for lapsed subscriptions.

**Wrong numbers:**
- **N1:** unpriced positions shown as a total loss.
- **N2:** the Rule of 40 off-by-one (fires false alerts).
- **N3:** unconverted foreign estimates.

**Claims and legal:**
- **C1:** "every plan has a trial, no card".
- **C2:** the refund policy contradicts itself.
- **C3:** the verification email promises a trial to every sign-up.
- **S5:** the Privacy Policy.
- Carried over: the **FMP commercial license**.

**Before any ad spend:** conversion tracking, including the server-side trial→paid conversion from the Stripe webhook.

## 1. Claims vs reality

| ID | Sev | Finding | Location | Fix | Verified | Status |
|---|---|---|---|---|---|---|
| C1 | blocker | The landing pricing block says "Every plan starts with a 14-day free trial — no credit card required". Only Beginner and Casual have a trial, and the trial collects a card. `Pricing.tsx:136` has the same unqualified trial line. | `components/landing/PricingTiers.tsx:23` | "14-day free trial on Beginner and Casual, card required, cancel before day 14" | code | fixed 2026-10-30: header text built from `TRIAL_PLAN_NAMES` in pricingTiers.ts (landing + /pricing) |
| C2 | blocker | The FAQ offers a "30-day money-back guarantee"; the Terms say no refunds for partial periods; no refund code exists. | `FAQ.tsx:59` vs `TermsConditions.tsx:102` | Pick one policy and use it in both places | code | fixed 2026-10-30: **policy is no refunds**; FAQ rewritten, Terms tightened to "all fees non-refundable" |
| C3 | blocker | The verification email tells **every** registrant "You will not be charged if you cancel before your 14-day free trial ends", including Active and Pro sign-ups, who are charged at once. | `email_service.py:313` | Make the line conditional on `selected_tier` | code | fixed 2026-10-30: trial line conditional on `get_trial_days(selected_tier)` |
| C4 | high | "24/7 monitoring" for price alerts. The price poller (which drives alerts) only runs 9:30–16:00 ET on weekdays. | `Landing.tsx:371`, waitlist pages; `websocket_service.py:50-64,109-111` | Say "monitored during market hours" | code | open |
| C5 | high | The pricing page comparison table (a sixth copy of the plan data, missed in today's fix) shows TA 20/40 a day (real: 10/20) and Smart Technical Alerts "5/day, 20/day" (real: a total of 5 and 20). | `Pricing.tsx:270,272` | Fix the values; better, build the table from `pricingTiers.ts` | code | open |
| C6 | high | The payment-failed email says the account will be "downgraded to Beginner", but the code locks it (`is_active=False`). Its "Update Payment Method" button goes to `/account`, which has no payment-method or billing-portal control. The trial-ending email has the same dead link. | `email_service.py:618-620,668-670`; `stripe_payments.py:582-600` | Correct the wording; add a Stripe Billing Portal link | code | open |
| C7 | high | The Terms say a cancelled trial keeps access until the trial ends; the code cancels immediately and locks the account. | `TermsConditions.tsx:99`, `FAQ.tsx:44` vs `AccountSettings.tsx:117`, `stripe_payments.py:751+` | Align the Terms, or cancel at period end | code | open |
| C8 | high | The Dashboard "Upgrade to Casual Investor" button has no handler, so it does nothing. Every Beginner user sees it. | `Dashboard.tsx:1458` | Link it to `/payment?tier=casual` | code | open |
| C9 | high | The Pricing FAQ offers "Save 20% with annual billing", but no annual prices exist, and `get_tier_for_price()` maps any unknown price to `beginner`. | `Pricing.tsx:345`; `stripe_payments.py:94-105` | Remove the FAQ entry; make unknown prices fail loudly | code | open |
| C15 | high | "Stock reviews" appear on every plan card, in emails and on the dashboard, but `stock_reviews` is never metered or used anywhere. It's a phantom feature. | `pricingTiers.ts`, `Pricing.tsx:268`, emails, `Dashboard.tsx:1456` | Define and meter it, or remove it everywhere | code | open |
| C10 | medium | Upgrading during a trial keeps the trial (no `trial_end='now'`), so a Beginner trial can become Professional for free, while the email says "Payment Successful, $50/month". | `stripe_payments.py:164-210` | Pass `trial_end='now'` for non-trial tiers | likely (Stripe behaviour) | open |
| C11 | medium | The FAQ says downgrades apply next cycle; the code and Pricing page apply them immediately with proration. | `FAQ.tsx:51` | Fix the FAQ wording | code | open |
| C12 | medium | The FAQ lists PayPal; checkout is card-only. | `FAQ.tsx:55` | Drop PayPal | code | open |
| C13 | medium | The Terms promise one trial per user per plan; nothing enforces it, so a user can re-trial after cancelling. | `TermsConditions.tsx:99`; `stripe_payments.py:160-176` | Check trial history before granting a trial | code | open |
| C14 | medium | The stale pre-launch `/waitlist` page and `public/waitlist.html` are still reachable. They say "we'll notify you when we go live", promise a no-card trial on every plan and priority support, show a "Free $0" tier and old limits, and use fake waitlist avatars. | `WaitlistLanding.tsx`, `public/waitlist.html` | Delete both; redirect `/waitlist` to `/` | code | open |
| C16 | medium | DCF "AI suggestions" are rule-based (no Claude call), and the "20% haircut" applies only to the trailing-growth fallback. | `Landing.tsx:315`, `DCFValuation.tsx:837,887` | Call them "data-derived suggestions" | code (agent) | open |
| C17 | medium | "No hallucinated tickers or made-up financials" is an absolute guarantee about LLM output. | `Landing.tsx:242` | Say "grounded in reported financials" | code (agent) | open |
| C18 | medium | Landing features are gated above the Beginner trial without saying so: AI analysis (hero), RelVal, drawing tools, watchlist batch analysis. | `Landing.tsx:124,269,277-355` | Add tier notes | code (agent) | open |
| C19 | medium | The verification email tells Beginner users their limits are "total" (lifetime); they are per week. | `email_service.py:163-178` | Use `get_review_period()` | code | open |
| C20 | medium | FMP vendor data is labelled "From SEC filings", and that grid includes market multiples. | `DCFValuation.tsx:903,937,1202,1338` | Say "from reported financials" | code (agent) | open |
| C21 | medium | Logged-in users switching plans see "Start Free Trial / won't be charged today", but the backend prorates with no new trial. | `Pricing.tsx:77-82`, `Payment.tsx:335-353` | Show trial copy only to users with no subscription | code (agent) | open |
| C30 | medium | Casual users who hit the TA limit get no upgrade prompt: 10/day is compared with 15/week as raw numbers. | `technical_analysis.py:74` | Compare `weekly_equivalent()` | code | open |
| C33 | high | **Screener preset descriptions imply outcomes**, and paid ads will point straight at them. "In Squeeze" says "A breakout often follows"; "Squeeze Fired (3d)" says "potential breakout underway". Milder: Gap Down "potential reversals or continued selling". Ad reviewers and skeptical Reddit users read the landing page (see S14). | `screener.py:708,721` (and the other `_PRESETS` descriptions) | e.g. "Bollinger Bands are inside the Keltner Channels, a condition traders watch for volatility expansion"; call it a *volatility* squeeze everywhere | code | open |
| C28 | low | Several FAQ claims don't hold: blog search; a newsletter and social links; tutorial links inside tools. **My 2026-10-30 edit says tutorials are "free for everyone", but they require a login** (`Tutorials.tsx`, `content.py:60`). | `FAQ.tsx:74,81,101,112` | Fix the answers ("tutorials are included with every plan") | code | open |
| C22–27, 29, 31–32 | low | Intraday copy oversells (multi-day zoom, "recently upgraded"). "The moment the market moves" (it's a 20s poll). Search claims "indexes". The trial-ending email rounds days down ("1 Days"). Plan names differ across surfaces. SMS is advertised but there's no SMS UI (plus an "email or email" typo). The FAQ promises a near-limit notification that doesn't exist. The hero demo card shows invented AAPL output without a "Sample" label. `manifest.json` still says "React App". A Terms typo ("NWC-AnalyticsLLC"). The Terms point to delete-account in settings, which doesn't exist. | various (see review) | Copy fixes | code (agent) | open |

Checked and accurate: indicator list, technical alert types, saved screens, Options Calculator features and Active+ gate, RelVal mechanics, every internal link target, email link expiry times, support and sales addresses, © year.

## 2. Money and account path

Overall: email verification is enforced. **The subscription itself is not enforced on the server**, and the lifecycle breaks once a payment fails or a user cancels.

| ID | Sev | Finding | Location | Fix | Verified | Status |
|---|---|---|---|---|---|---|
| M1 | blocker | **A locked account can never come back.** Cancel, trial-cancel and exhausted retries set `is_active=False`. The "Inactive user" 403 is raised inside a `try` whose `except Exception` turns it into a 401. Login checks `is_verified`, not `is_active`. So the user logs in and every call (including `/stripe/create-subscription`) returns 401: a login loop, with "you can resubscribe anytime" on screen. | `api/dependencies.py:47-58`; `stripe_payments.py:598,785` | Don't touch `is_active` on cancel; gate features on subscription status; let lapsed users reach `/payment` and `/stripe/*` | code | open |
| M2 | blocker | **past_due, unpaid, incomplete and paused subscriptions are invisible.** Every `Subscription.list` asks only for `active`/`trialing`. The guard sees no status and sends the user to `/payment`, which creates a **second** subscription (a fresh trial on Beginner/Casual) while the old one keeps retrying, risking double billing. A past_due user can't cancel either (404). | `stripe_payments.py:164-179,699-717,840-853`; `App.tsx:63-66` | List `status='all'`; send past_due users to a fix-payment flow; allow cancelling past_due | code (runtime for Stripe retry settings) | open |
| M3 | blocker | **Users can't update their card.** No Billing Portal or update-card endpoint exists, but the payment-failed and trial-ending emails tell users to do it at `/account`, which is behind the guard and has no such control. | `email_service.py:618,668`; `AccountSettings.tsx` | Stripe Customer Portal endpoint + link; let past_due users through the guard to it | code | open |
| M4 | high | Webhook dedup records the event id **before** handling it. A handler that fails returns 500, and Stripe's retry is then skipped as a duplicate, so the event (e.g. `invoice.paid`) is lost. The dedup store is also in memory. | `stripe_payments.py:32-45,421-457` | Mark processed only after success; persist it | code | open |
| M5 | high | The trial and its tier are granted **before** the card is confirmed (no `payment_behavior='default_incomplete'`). A declined or abandoned card form still leaves a working 14-day trial with no card on file. | `stripe_payments.py:260-289`; `Payment.tsx:114-125` | `default_incomplete`; grant the tier from the webhook | code (runtime: whether `pending_setup_intent` can be null) | open |
| M6 | high | Upgrades use `create_prorations`, so nothing is charged now but the higher tier is granted at once, with a "payment successful" email. Upgrading and then cancelling gets the higher tier for the old price. | `stripe_payments.py:201-253` | `always_invoice` + `pending_if_incomplete`; set the tier from the webhook | likely | open |
| M7 | high | Swapping a trialing Beginner/Casual subscription to Active/Pro keeps the free trial (same as C10). | `stripe_payments.py:201-213` | `trial_end='now'` when the target has no trial | likely | open |
| M8 | high | **No server-side subscription enforcement.** The backend checks only `is_active`, so a verified user who never paid uses every API at Beginner limits. The client guard fails open on any error. | `App.tsx:69-71`; `api/dependencies.py` | Store the subscription status on User from webhooks; enforce it in a dependency | code | open |
| M9 | high | Any `subscription.deleted` locks the user, even when another live subscription exists (e.g. the duplicate from M2). | `stripe_payments.py:582-600` | Check for remaining live subscriptions before locking | code (agent) | open |
| M10 | high | Synchronous Stripe and Postmark calls run inside `async def` handlers on every guarded page load (Dashboard makes six). Under ad traffic this stalls all requests, the price stream and the alert checker. | `stripe_payments.py:835-853` + webhook email calls | Cache the status on User; `asyncio.to_thread`/async Stripe | code (agent); impact needs load test | open |
| M11 | high | The alert checkers ignore account status and tier, so locked or churned users keep getting email **and SMS (Twilio cost)**, and downgraded users keep SMS and indicator alerts. | `alert_checker.py:108-116,193`; `technical_alert_checker.py:99-106` | Filter on the user's status; re-check the tier at send time | code | open |
| M21 | high | The AI price forecast (a Claude call) has no tier gate: Beginner (`ai_analysis=0`) gets it on every stock lookup. | `stock_analysis.py:295-317` | Tier-check and meter it | code | open |
| M23 | high | `/indicators/*` (6 routes, full TA with signals) need no login, bypassing the TA quota; the frontend doesn't use them. The intraday and live-price routes are also open. | `indicators.py` (no `Depends`), `intraday.py`, `live_prices.py` | Delete `/indicators`; require auth on data routers | code | open |
| M12 | medium | `subscription.updated` trusts a possibly stale payload and writes the tier for `incomplete`/`paused` statuses. | `stripe_payments.py:553-579` | Re-fetch; set the tier only for active/trialing | likely | open |
| M13 | medium | An unknown price ID silently maps to Beginner (same as C9). | `stripe_payments.py:94-104` | Fail loudly; map legacy prices | code | open |
| M14 | medium | A scheduled cancellation can't be undone (the "already on this plan" 400 fires first), and the Account page never shows "cancels on <date>". | `stripe_payments.py:186-197` | Resume action; show the end date | code (agent) | open |
| M15 | medium | Changing plan on the Payment page requires typing a full card that's then ignored; downgrading shows "Start your free trial". | `Payment.tsx` | Plan-change confirmation with no card fields | code (agent) | open |
| M16 | medium | Plan choice gets lost: every `/register` CTA leads to Beginner checkout; "Change plan" sends logged-in users to the registration form ("Email already registered"); resend drops the tier; `?tier=foo` isn't validated. | `Register.tsx`, `Payment.tsx:386`, `Login.tsx:112`, `RegisterWithPayment.tsx` | Route "Change plan" to `/pricing`; validate the tier | code (agent) | open |
| M17 | medium | A Stripe API error returns status `null`, and the guard then sends paying users to the trial checkout. | `stripe_payments.py:854-855` | Return 503/"unknown"; the guard passes through | code (agent) | open |
| M18 | medium | 90-minute sessions with no refresh and no global 401 handler: actions fail in place and form state is lost. | `api.ts` (no response interceptor) | Response interceptor → `/login?next=` | code (agent) | open |
| M19 | medium | Email lookups are case-sensitive: "Tyrone@…" vs "tyrone@…" can't log in, or become two accounts with two trials. | `auth.py:45,224,303` | Lowercase on write and read + migration with a unique `lower(email)` index | code (agent) | open |
| M20 | medium | Verification emails interpolate `selected_tier` and `full_name` unescaped, so anyone can send injected links from your support@ sender. | `auth.py:41,150`; `email_service.py:147,296-308` | Whitelist the tier; `html.escape` | code (agent) | open |
| M22 | medium | "Stock reviews" is never enforced (same as C15). | `tier_limits.py` | See C15 | code | open |
| M24 | medium | Lifecycle emails: no receipt on trial conversion or renewal; "payment success" for upgrades that charged nothing; a race can skip the email; "2 Days" when it's 3. | `stripe_payments.py:236-245,492,539,656-659` | Send on `invoice.paid` with `amount_paid>0` | code (agent) | open |
| M25 | medium | If `STRIPE_WEBHOOK_SECRET` is empty, webhooks can be forged; it isn't in the startup echo. | `config.py:80` | Fail startup when empty | runtime | open |
| M26 | medium | On Stripe API version ≥ 2025-03-31, `invoice.subscription` is gone and the invoice handlers silently no-op. | `stripe_payments.py:511,610` | Pin the webhook API version, or read the new field | runtime | open |
| M27 | medium | `/phone/send` and `/phone/verify` aren't throttled (Twilio cost; OTP guessing); the three files state the SMS tier rule differently. | `phone.py`, `alerts.py:101`, `technical_alerts.py:124` | Cooldown + attempt cap; one rule | code (agent) | open |
| M28–35 | low | No rate limit on login, register or forgot-password; an unverified registration can squat an email (pre-hijack); no Stripe idempotency keys; dead `/create-checkout-session` still live and creating customers; the RelVal quota meters the wrong step; TA preset endpoints are broken but still charge quota; Pricing disables Beginner for unpaid users; stale tier copy on `/waitlist`. | see review | various | code (agent) | open |

**Where each limit is enforced on the server:** watchlist, portfolio, alerts, saved screens, DCF, RelVal (wrong step), TA (bypassable via `/indicators`), watchlist screens, AI analysis (except the price forecast). **Not enforced:** `stock_reviews` (nowhere), the Options Calculator (UI only), SMS and indicator alerts after a downgrade. Every check is check-then-insert with no lock.

## 3. Dead and duplicate code

Plan data is still copied in about 15 places outside `pricingTiers.ts` / `tier_limits.py`. Dead code turned up two real bugs (D5, D6).

| ID | Sev | Finding | Location | Fix | Verified | Status |
|---|---|---|---|---|---|---|
| D5 | high | **Price alerts created after a deploy may never be checked.** Alert tickers join the price feed only at startup; `subscribe_new_alert_ticker` has no callers, and `create_alert` never subscribes the ticker. A new alert on a ticker nobody has open isn't polled until the next restart. | `alert_checker.py:386`; `alerts.py` `create_alert` | Call it in `create_alert` and when an alert is re-armed | code | open |
| D4 | high | No catch-all 404 route. `server.js` returns index.html for every path, so a mistyped or stale ad URL gets HTTP 200 and an empty page. | `App.tsx:91-119` | NotFound page (noindex) with links to `/` and `/pricing` | code | open |
| D8 | high | **SMS is half-removed.** The UI went in Feb 2026 ("rebrand 1"), but the phone router, the Twilio send path and the `sms_alerts` flags are live (see S1). Three files state the SMS tier rule three ways. The Alerts meta and the Feature Log still advertise SMS. | `phone.py`, `sms_service.py`, `api.ts:267-279`, `Alerts.tsx:438` | **Your call:** restore the UI, or delete the whole SMS path | code | open |
| D9 | high | The signup and receipt emails keep their own tier names, periods (`beginner: "total"`) and prices instead of using `tier_limits` helpers (see C19). | `email_service.py:157-168,357-362` | Use `get_review_period()` and one name helper; pass the price in | code (agent) | open |
| D2/D3 | high | The Pricing table and the waitlist pages: see C5 and C14. | — | — | code | open |
| D6/D7 | high | The dead Dashboard upgrade button and the unmetered "stock reviews": see C8 and C15. | — | — | code | open |
| D10 | medium | Plan names differ across 7+ copies ("Casual Investor" / "Casual Retail Investor" / "Casual"), and the tier order is defined in 5 places. | `tier_limits.py:139` (unused helper), `stripe_payments.py:81`, `email_service.py:156`, `AccountSettings.tsx`, both UpgradeRequired, `NavBar.tsx:58`, `Pricing.tsx:59` | One name source per side | code (agent) | open |
| D11 | medium | Tier gates that exist only in the frontend disagree: the intraday chart is Active+ on the screener but open to every tier on Watchlist and Portfolio; Options Calculator has no `tier_limits` key. | `Stocks.tsx:3908`, `Watchlist.tsx:352`, `Portfolio.tsx:573`, `OptionsCalculator.tsx:1012` | Feature flags in `TIER_LIMITS`; one gate helper | code (agent) | open |
| D12 | medium | Tier limits hard-coded in page code (they match today and will drift). | `Alerts.tsx:243`, `Watchlist.tsx:256,461,495`, `Portfolio.tsx:585`, `Dashboard.tsx:778`, `Register.tsx:271`, `pages/UpgradeRequired.tsx` COMPARISON_ROWS, `Landing.tsx:241,375` | Serve limits from `/auth/me` or one frontend map | code (agent) | open |
| D14 | medium | Two UpgradeRequired components; the `pages/` copy is used only by the Options Calculator. | `pages/UpgradeRequired.tsx` | Move the Options Calculator to the component; delete the page | code (agent) | open |
| D15 | medium | `/register` (Register.tsx, Beginner-only) and `/registerwithpayment` are both live (see M16). | `App.tsx:95,99` | Point `/register` at RegisterWithPayment; delete Register.tsx | code (agent) | open |
| D16 | medium | Seven dead `api.ts` methods, while 47 raw axios calls in 15 files each build their own `API_URL` (16 copies) and auth header; the intraday batch fetch is copy-pasted 7× and has drifted. `api.ts:19` logs a token prefix on every request. | `services/api.ts` + pages | Route everything through `api.ts`; drop the console.log | code (agent) | open |
| D17 | medium | `_safe_error` copied 8× with differences; ~25 log lines print raw httpx errors containing `apikey=` (see S10). | 8 files | One redaction helper or logging filter | code (agent) | open |
| D18 | medium | The batch-quote fallback is copied 3× (drifted). 18 call sites go around `_fmp_get` (no 429 retry), including `financials_service._fetch`, which returns `[]` on any failure, the empty-equals-failed pattern CLAUDE.md forbids. | `stocks.py:454-746`; `financials_service.py:188` | One helper; route calls through `_fmp_get` | code (agent) | open |
| D19/D20 | medium | The usage-limit check is copied 4×; the auth dependency is implemented 5× (with two different admin checks). CLAUDE.md documents `increment_feature_usage()` (doesn't exist) and points auth at `core/security.py` (dead copy). | `dcf_valuation.py`, `relative_valuation.py`, `technical_analysis.py`, `portfolio_analysis.py`; `security.py:77-137` | Promote the TA helper to `core/`; one auth and one admin dependency | code (agent) | open |
| D21 | medium | Four junk-ticker filters with conflicting rules, and two different US exchange sets. | `stocks.py:783-785`, `refresh_stock_snapshots.py:126,256`, `market_data.py:297`, `fetch_daily_snapshots.py:149` | Export `_is_common_stock` / `US_EXCHANGES` from one module | code (agent) | open |
| D22 | medium | Dead endpoints, several open without auth: `/indicators/*`, `/stocks/screener`, `/stocks/{ticker}`, `/live-prices/snapshot`, `/live-prices/status`, `/technical-analysis/watchlist`, **`/stripe/create-checkout-session`** (a second subscription path, which also makes `/payment-success` effectively dead), `/waitlist/count`, waitlist admin, `/content/tutorials/{id}`. | various | Delete, or put behind admin | code (agent) | open |
| D23 | medium | **CLAUDE.md is stale:** Recharts is used in 4 live files and mixed with Chart.js on Stocks and TechnicalAnalysis; the screener is backed by `stock_snapshots`, not `DailyStockSnapshot`; the router table lists 12 of 22; the "single FMP path" claim, the auth location and the tier-gating API are all outdated. | `CLAUDE.md` | Update | code | open |
| D24 | medium | The Feature Log (used as a marketing source) is stale: SMS OTP flow, SendGrid (it's Postmark), intraday gate. | `NWC-Analytics-Feature-Log.md:257-274,521` | Correct it | code (agent) | open |
| D25 | medium | The sitemap is missing `/faq`, `/privacy` and `/terms`. robots.txt doesn't disallow `/waitlist`; its sitemap URL 301s to `api.` (a cross-host sitemap; check Search Console). | `sitemap.py:18`, `public/robots.txt` | Update both | code (agent) | open |
| D26 | medium | Three intraday chart implementations; `Intradaymodal.tsx` has zero importers. | `components/Intradaymodal.tsx` | Delete | code | open |
| D27–37 | low | **41 MB unreferenced `public/1000046121.mp4` ships in every build.** Dead `Blogs.tsx` (`/blogs` routes to BlogList). Unimported `TechnicalAnalysis403`, `LiveBadge`, `HeroSection`. Duplicate money formatters (CLAUDE.md mandates `formatUsd`). Unused `CORS_ORIGINS` and `VERSION` settings. Trial rules defined in 3 places. Duplicate TA helpers. `manifest.json` "React App". **Tracked junk:** `~$C Analyzer Product.docx` (Office lock file), `backend/backend_structure.txt`, `backend/package*.json`. **The daily snapshot cron prints every waitlist email to the logs** (`fetch_daily_snapshots.py:300-362`). Unused deps `date-fns` and `react-quill-new`. | see review | Delete or merge | code (spot-checked) | open |

**Safe to delete (zero references, grep-verified):**
- frontend pages and components: `pages/Blogs.tsx`, `pages/TechnicalAnalysis403.tsx`, `components/Intradaymodal.tsx`, `components/LiveBadge.tsx`, `components/landing/HeroSection.tsx`, `App.css`, `logo.svg`, `App.test.tsx` (CRA boilerplate)
- public assets: `public/1000046121.mp4`, `public/favicon_io/`, `public/logo.png`, `public/og-default.png`, `public/apple-touch-icon.png`
- repo junk: `~$C Analyzer Product.docx`, `backend/backend_structure.txt`, `backend/package*.json`
- dead code inside files:
  - `api.ts`: `stripeAPI`, `phoneAPI`, `authAPI.verifyEmail`, `intradayAPI.getBatch`, the default export and the token console.log
  - `Payment.tsx`: `PRICE_NUMS`
  - `tier_limits.py`: `can_add_*`, `get_trial_days`, `get_tier_display_name`
  - `stocks.py:21`: the unused `can_use_feature` import
  - `security.py:77-137`
  - `vendor_registries.grounded_vendor_keys`

**Delete only after a decision:**
- `pages/UpgradeRequired.tsx` (after migrating the Options Calculator)
- `pages/Register.tsx` (after repointing `/register`)
- the waitlist pages
- `phone.py` and `sms_service.py` (the SMS decision)
- the root `package.json`
- `public/images/*.png` (may be embedded in blog HTML)

**Do not delete:** `alert_checker.subscribe_new_alert_ticker`. Wire it up (D5).

## 4. Data correctness

The core invariants mostly hold:
- the chandelier stop is entry-independent
- alerts are one-shot and only consumed after delivery
- the screener passes skip failed fetches
- financials are converted to USD and nulled at source on an identity contradiction
- the selftests for technical_indicators, valuation_check and fx all pass

The problems are request-time paths that go around those rules.

| ID | Sev | Finding | Location | Fix | Verified | Status |
|---|---|---|---|---|---|---|
| N11 | **blocker: before Mon Nov 2** | **The technical-alerts cron runs before the close once daylight saving ends.** The documented schedule `30 20 * * 1-5` UTC is 4:30 pm EDT today but **3:30 pm EST from Nov 2**: alerts would evaluate a partial session and save wrong state. The script's docstring says `30 21`. | `railway-cron.toml:38`; Railway dashboard (the real schedule) | **In the Railway dashboard, set `check-technical-alerts` to `30 21 * * 1-5`** (4:30 pm EST / 5:30 pm EDT), and check `compute_squeeze` (its schedule is "unknown" in the toml). **The planned "Squeeze Fired" ad hook depends on `compute_squeeze` running after the close.** If it runs mid-session, the advertised preset shows partial-day results. | code + **dashboard check** | open |
| N1 | blocker | **Portfolio and Dashboard count an unpriced position as a total loss**: its value adds 0 but its full cost is still counted, and `get_batch_quotes` returns `{}` on any error (a 429 → the portfolio shows −100%). The Dashboard computes it three different ways. | `portfolio.py:104-114`; `Portfolio.tsx:406-409`; `Dashboard.tsx:331,384,490`; `market_data.py:421-423` | Leave unpriced positions out of both value and cost; show "N unpriced"; make a quote failure visible | code | open |
| N2 | blocker | **Rule of 40 "YoY" compares with 3 quarters ago** (`income_quarters[3]`; quarters are newest-first). Drives the DCF page **and the rule_of_40 alert**, e.g. AAPL Sep vs the prior Dec quarter shows −24% and fires a false alert. | `financials_service.py:834-838` (also `revenue_growth_trend` 819-829, matched by index) | Use the date-matched YoY `_derive_dcf_suggestions` already computes | code | open |
| N3 | blocker | **A missing reporting currency is treated as USD for analyst estimates.** `usd_rate(None)` returns 1.0, so when `get_reporting_currency` fails, yen or TWD forward EPS show as dollars (Toyota "0.1x forward P/E", a RelVal target of $35,000). | `fx.py:98`; `stocks.py:1497-1504`; `relative_valuation.py:181` | Unknown currency gives rate None (blank) for estimates; only statement rows default to USD | code (frequency: runtime) | open |
| N4 | high | The TA page shows its **own** simple-average RSI and short-seeded MACD, discarding the shared Wilder/standard versions that alerts and screens use. The page says RSI 28 while the alert computes 34 and never fires. | `technical_analysis.py:296-363,465`; copy in `stock_analysis.py:367-405` | Build the chart histories from `technical_indicators` | code | open |
| N5 | high | **A failed financials fetch becomes a DCF verdict and an alert.** It invents FCF as `market_cap * 0.05` (or `price * 1,000,000`), and the page still shows a rating and "Trade This"; the alert path does the same with no banner. | `dcf_valuation.py:720-736`; `technical_alert_checker.py:498` | Refuse (`requires_manual_fcf`) unless FCF is from filings; the alert skips | code | open |
| N6 | high | Request-time FMP calls skip the 429 retry and return `[]` on failure, so a throttled call shows "may not have SEC filings", or a DCF that ignores net debt under a green "Actual TTM" badge (see D18). | `financials_service.py:188-198`; `analyst_estimates`; `_fetch_peer_ratio`; `_fetch_fmp_dcf` | Route through `_fmp_get`; an explicit "unavailable" state | code (agent) | open |
| N7 | high | `/stocks/dividends` ignores `fetch_failed`, so a throttled fetch shows "No dividends distributed" and Portfolio income silently drops the ticker. | `stocks.py:1031-1062`; `Stocks.tsx:3011`; `Portfolio.tsx:146-160` | Pass the failure through; show "Dividend data unavailable" | code | open |
| N8 | high | Dividend `cash_amount` prefers unadjusted `dividend` over `adjDividend`, so after a split the yield is overstated until the next ex-date (a 10:1 split gives a ~13% yield at the top of "Dividend Income"). | `market_data.py:780` | Prefer `adjDividend` | runtime (check FMP field semantics) | open |
| N9 | high | FMP's own DCF and price-target consensus (unconverted per CLAUDE.md, e.g. Sabesp ~5× price) are still shown with "% upside" and "🟢 Undervalued", and fed into the AI target. | `Stocks.tsx:2317-2345`; `dcf_valuation.py:542-549,877-885`; `stock_analysis.py:271-288` | Suppress when the reporting currency isn't USD or the ratio is implausible | code (agent) | open |
| N10 | high | **Stock page race:** responses aren't checked against the ticker on screen. Clicking NVDA then AMD can show NVDA's live price and identity verdict on AMD. | `Stocks.tsx:940-1060,1209-1245` | A per-load token; drop stale responses | code (agent) | open |
| N12 | high | Sector heatmap closes are stamped `date.today()` at 06:00 UTC, so Monday's close is labelled Tuesday and weekends copy Friday; Monday's "1 Day" view shows 0.00% everywhere. | `sector_rotation.py:114`; `main.py:83-86` | Stamp the session date in ET; skip non-trading days | code | open |
| N13 | high | The "forward" analyst-estimate year can be one that's already reported (NVDA's January FY, MSFT's June, AAPL's September), or the nearest year gets cut by `limit: 4`. | `analyst_estimates.py:106,128-133` | Fetch ≥10 rows; pick the first period ending after today | runtime | open |
| N14–N26 | medium | **N14** after-hours change measured from yesterday's close (a +5% day shows "AH ↑5%" all weekend). **N15** negative and below-floor P/E and EV/EBITDA shown outside the screener ("-24x trailing earnings"; junk peers in the RelVal median). **N16** the TA page uses FMP `dividendYieldTTM` with no recency gate. **N17** ROE/ROA rounded to whole percents. **N18** the TA page fetches 250 days, so no 200-day SMA (check). **N19** screener "as of" shows a time with no date. **N20** "Today's market" cards show the previous session with no date. **N21** the closing screener snapshot can land before the closing auction. **N22** plain dates parsed as UTC, so labels are a day early in US time zones. **N23** the stock-page valuation header and AI target ignore `entity_trust`. **N24** quarterly P/E across splits (check). **N25** the watchlist "vs target" is frozen at page-load price. **N26** the DCF keeps the previous ticker's growth and WACC inputs. | see review | various | code (agent); N18, N21, N24 runtime | open |
| N27–N34 | low | Stochastic, CCI and ROC treat a reading of 0 as missing. ~19% of ETFs never get a yield. Screener yield and RelVal peers aren't identity-gated. Intraday says "open" after the close. **Every user's triggered alert is broadcast to every browser.** An alert can be re-sent if the commit fails. Missing quote fields render as $0.00. Negative FCF produces a "Strong Sell". | see review | various | code (agent) | open |

## 5. Security and compliance

**Verified clean:**
- no user can reach another user's data by ID (IDOR)
- admin endpoints check `is_admin`
- SQL is parameterized
- the Stripe webhook verifies its signature
- no secrets are committed
- `SECRET_KEY` is required; bcrypt is used for passwords

The exposure is mostly cost and abuse, not data theft.

| ID | Sev | Finding | Location | Fix | Verified | Status |
|---|---|---|---|---|---|---|
| S1 | blocker | **Unlimited SMS to any +1 number** (Twilio cost, SMS-pumping fraud, TCPA exposure). `/phone/submit` has no cooldown or cap. The only gate is Casual tier, which can be had via a trial with no confirmed card (M5). **No frontend calls it**, so it's pure attack surface. | `phone.py:54-110`; `sms_service.py` | Unmount the phone router until an SMS UI with consent exists; then add cooldowns and a daily cap, plus Twilio Geo Permissions and Fraud Guard | code | open |
| S2 | blocker | **Auth emails work as a phishing relay.** `full_name` and `selected_tier` go unescaped into the HTML (`selected_tier` lands inside an `href`). Register and forgot-password have no rate limits, and case-variant emails count as new accounts. Complaints would get Postmark to suspend the sender, which kills **every** app email. (Combines M19, M20, M28.) | `email_service.py:147-148,296-308`; `auth.py:37-103,294-340` | `html.escape` everything; whitelist the tier; lowercase emails; per-IP and per-address limits | code | open |
| S3 | blocker | **One unauthenticated WebSocket message stops live prices and every price alert for everyone.** `/live-prices/ws` needs no auth and doesn't validate tickers. A non-string ticker makes `",".join(tickers)` throw on every poll, inside a catch-all print. | `live_prices.py:14-52`; `websocket_service.py:114,163` | Require a JWT; accept only strings matching `^[A-Z.\-]{1,10}$`; cap tickers per client | code | open |
| S4 | blocker | **Password-reset and email-verify tokens reach analytics.** `PageviewTracker` sends `pathname + search`, Clarity session replay runs on every route, and ad pixels record full URLs by default. A verify token is exchanged for a JWT. | `App.tsx:40`; `public/index.html:40-60`; `email_service.py:148,493` | Strip the query on those routes (GA4's default `page_location` too), or move the token to `#fragment`; load no pixels there | code | open |
| S5 | blocker | **The Privacy Policy names only Stripe and Railway.** Not disclosed: GA4, Microsoft Clarity (session replay), Cloudflare, Anthropic (receives portfolio holdings), Twilio, Postmark; no Do Not Track or cross-site tracking statement; the cookies section is wrong (the session is a localStorage JWT); no retention periods; it describes a deletion process that doesn't exist. Full gap list in the review. | `PrivacyPolicy.tsx` | Rewrite before the pixels go live | code | open |
| S6 | high | The paywall exists only in the browser (same as M8 and M5). | — | See M8 | code | open |
| S7 | high | No rate limiting anywhere, and **bcrypt runs synchronously on the event loop** (single uvicorn worker), so a few logins per second stall the whole API and the price stream. | `auth.py`; `security.py:26-33` | `asyncio.to_thread` for bcrypt; rate limits on auth, phone, waitlist and AI | code (agent) | open |
| S8 | high | 32 unauthenticated routes make the app a free public proxy for licensed FMP data and let a scraper burn the shared FMP quota; `/intraday/batch` takes unlimited tickers (see M23). | `stocks.py` (22 routes), `intraday.py`, `indicators.py` | Router-level `dependencies=[Depends(get_current_user)]`; delete `/indicators`; cap batch size | code (agent) | open |
| S9 | high | AI price forecast ungated (same as M21). | — | See M21 | code | open |
| S10 | medium | **The FMP API key is written to logs.** `print(f"...{e}")` after `raise_for_status()` includes the URL with `apikey=`. This is a separate path from the `_safe_error` fix. | `dcf_valuation.py:81,104`; `financials_service.py:197`; `websocket_service.py:164`; `analyst_estimates.py:137`; `refresh_stock_snapshots.py:527` | Send the key as a header or httpx event hook, or redact in one shared logger | code | open |
| S11 | medium | The blog iframe sandbox is ineffective: `allow-scripts allow-same-origin` on `srcDoc` runs post HTML as the site origin, so it can read every reader's `access_token`. | `BlogPost.tsx:103`; `AdminContent.tsx:696` | Drop `allow-same-origin` | code | open |
| S12 | medium | A webhook that fails once is lost (same as M4). | — | See M4 | code | open |
| S13 | medium | There's no account-deletion capability at all, though the Policy and Terms promise one; locked accounts are kept forever. | `PrivacyPolicy.tsx:120,144`; `TermsConditions.tsx:159` | Delete-account endpoint (DB + Stripe customer), or a documented email process; state retention periods | code (agent) | open |
| S14 | medium | **Investment-advice exposure:** "✦ NWC AI target price $X, +Y%" on every stock page with no nearby disclaimer; the Terms don't mention AI output; TA signals say "Consider buying/selling". | `Stocks.tsx:2348-2368`; `technical_indicators.py:109-110` | Inline "AI-generated estimate, not investment advice"; an AI clause in the Terms; reword the signals | code (agent) | open |
| S15 | medium | No Terms or Privacy acceptance at signup (browsewrap), and no trial-start email stating the renewal price, date and how to cancel (California auto-renewal law). | `Register*.tsx`, `Payment.tsx`; `stripe_payments.py:279-289` | Consent line at signup; trial-confirmation email | code (agent; legal reading) | open |
| S16 | medium | Clarity session replay records authenticated pages (portfolio, P&L, email). | `public/index.html:52-60` | Marketing routes only, or Strict masking; disclose it | code (masking: dashboard setting) | open |
| S17 | medium | Phone OTP can be brute-forced (no attempt limit). | `phone.py:113-139` | Lock after 5 tries | code (agent) | open |
| S18 | medium | No CSP or `frame-ancestors`, while the JWT sits in localStorage readable by every third-party script, with three more pixels coming. | `server.js`; `api.ts:16` | CSP with a script-src allowlist + `frame-ancestors 'none'` | code (agent) | open |
| S19–26 | low | Raw exception text returned to clients (`financials.py:80`, `sector_rotation.py`, `stripe_payments.py:741,801`); **API docs public in production** (`main.py:120-126`); account enumeration on forgot-password; empty webhook secret not checked at boot (M25); the first 8 characters of the Postmark token printed at startup; password change doesn't revoke JWTs; waitlist POST has no rate limit; unsubscribe path needed before any marketing email (not on the transactional stream). | see review | various | code (agent) | open |

Unauthenticated routes and Privacy Policy gaps: see the appendix at the end.

## 6. Manual click-through checklist

Code review can't confirm these. Do them on the live site, on desktop **and** a phone (about 375px wide), in **light and dark** mode.

### Account and money (use a real card; cancel inside the trial)
- [ ] Landing → every CTA lands where it says.
- [ ] Pricing page shows $10 / $20 / $40 / $50, with trial badges only on Beginner and Casual.
- [ ] Register from the landing CTA **and** from the pricing page. Note which sign-up page each one uses.
- [ ] The verification email arrives (check spam), the link works, and login works afterwards.
- [ ] Start a Beginner trial. Payment success page → the Account page shows the plan and trial end date.
- [ ] Upgrade Beginner → Casual during the trial. Check what Stripe charges and what the app's tier shows.
- [ ] Cancel. Confirm access lasts until the period end and the Account page says so.
- [ ] Resubscribe after cancelling.
- [ ] Password reset: the email arrives, the link works, the new password works and the old one doesn't.
- [ ] Leave a tab open past 90 minutes (token expiry). What happens on the next click?
- [ ] Logged out, open /dashboard, /stocks and /account directly. Each should redirect to login.

### Core pages: test with AAPL, an ADR (TSM), an ETF (SPY), a foreign filer (TM) and a micro-cap
- [ ] Screener: presets, sorting, filters, and opening the intraday chart from a row.
- [ ] Company financials, DCF and RelVal: figures in USD, conversion note shown for TM/TSM, nothing blank without an explanation.
- [ ] Technical analysis: every chart renders; the ATR stop calculator works.
- [ ] Dashboard: market movers, indexes, commodities, crypto and treasury cards and their modals.
- [ ] Watchlist and portfolio: add, edit and delete; P&L and dividend income look right.
- [ ] Alerts: create a price alert that triggers soon and confirm the email arrives (and the SMS, if offered).
- [ ] Hit a tier limit on purpose (e.g. a 6th DCF on Beginner). The upgrade prompt shows the right plans and prices.

### Fit and finish
- [ ] Every page in dark **and** light mode: no invisible text or lines (like the intraday "Open" line was).
- [ ] At phone width: no sideways scrolling, tables usable, modals closable, charts readable.
- [ ] /this-page-does-not-exist shows a proper 404.
- [ ] Browser tab titles make sense on each page.
- [ ] Footer links (Privacy, Terms, FAQ, contact emails) all work.
- [ ] Lighthouse (mobile) on the landing page: note performance and accessibility scores.
- [ ] Verification and trial-ending emails render properly in Gmail and Outlook.

## Fixed earlier on 2026-10-30 (before the review started)

| Fix | Where |
|---|---|
| Plan prices and features unified on `pricingTiers.ts` (`getTierSummary`); the FAQ said Beginner was free with $9.99/$19.99/$39.99; the pricing page over-promised Active/Pro technical-analysis limits; the upgrade prompt showed a stale "Free $0" plan | `frontend/src/data/pricingTiers.ts`, `components/UpgradeRequired.tsx`, `pages/UpgradeRequired.tsx`, `pages/AccountSettings.tsx`, `pages/FAQ.tsx`, `pages/Register.tsx`, `pages/Landing.tsx` |
| S&P 500 and Dow removed from the index card (S&P DJI licensing; no FMP plan unlocks them) | `endpoints/stocks.py`, `pages/Dashboard.tsx`, `endpoints/portfolio_analysis.py` |
| FMP API key could leak in 500 error details (`_safe_error` only matched `apiKey=`) | 6 endpoint files |
| Six bare `except Exception: pass` blocks now log; the portfolio AI no longer reports a failed dividend fetch as "no dividends" | `stocks.py`, `portfolio_analysis.py`, `portfolio_analyzer.py`, `stock_analysis.py` |
| Intraday chart: green/red baseline fill; open line visible in light mode | `components/ScreenerChartPanel.tsx` |

## Open items carried into the review

- **FMP commercial data license.** Ultimate is a personal-use plan; showing FMP data to paying users needs a commercial plan with a Data Display license. Awaiting FMP's quote. **Blocker.**
- **Screener common-stock filter** lets notes and preferreds through (TBB, TMUSL, STRK).
- **No conversion tracking.** GA4 records page views only. Needed before ad spend: Reddit Pixel, Google Ads, Microsoft UET, plus server-side trial→paid conversions from the Stripe webhook.
- **Minimal automated tests** (2 test files).

## Appendix A: Unauthenticated routes (for S8)

| Route | Verdict |
|---|---|
| `GET /`, `/api/v1/health` | Public, OK |
| `/api/v1/docs`, `/redoc`, `/openapi.json` | Turn off in production (S19–26) |
| `POST /auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/resend-verification` | Public by necessity; need rate limits and escaping (S2, S7) |
| `GET /auth/verify-email`, `POST /auth/reset-password` | Public, OK (token) |
| `GET /content/blogs`, `/blogs/categories`, `/blogs/{slug}` | Public, OK |
| `GET /market/ticker-tape`, `/ticker-tape/screens` | Public, OK (landing page, cached) |
| `GET /screener/presets`, `/sitemap.xml`, `/stripe/config` | Public, OK |
| `POST /stripe/webhook` | Public, OK (signature verified) |
| `POST /waitlist`, `GET /waitlist/count` | Public; add a rate limit |
| `WS /live-prices/ws` | **Leak:** S3 |
| `GET /indicators/*` (6 routes) | **Leak:** no frontend caller. Delete. |
| `GET /intraday/batch`, `/intraday/{t}`, `/intraday/{t}/bars-with-ma` | **Leak:** FMP cost; batch unbounded |
| `GET /stocks/*` (22 routes: quote, company, historical, news, treasury, commodity/crypto/index quotes, IPOs, dividends, search, ETF info/holdings, screener, analyst estimates, implied volatility, top gainers/losers, daily snapshot, keyword search) | **Leak:** FMP passthrough used only by logged-in pages |

## Appendix B: What the Privacy Policy must add (for S5)

- **Analytics and session replay, by name:** GA4, Microsoft Clarity (session recording), Cloudflare Web Analytics, Google Fonts. For each: what it collects and how to opt out.
- **Ad pixels, once added:**
  - Reddit Pixel, Google Ads, Microsoft UET: advertising cookies, retargeting, cross-site tracking, with opt-out links (Google Ads Settings, Microsoft, Reddit, NAI/DAA).
  - Whether hashed emails are sent (enhanced conversions).
  - A sale/sharing statement, and how Global Privacy Control is handled.
- **CalOPPA:** the Do Not Track response, and that third parties collect data across sites over time.
- **Anthropic as an AI processor:** receives portfolio holdings (tickers, quantities, cost basis, P&L, value) and company data. Retention, and no training use.
- **Twilio and SMS:** phone collection and purpose, message frequency, "msg & data rates may apply", STOP/HELP, and the 10DLC clause that mobile info isn't shared for marketing.
- **Postmark:** email addresses and email content, including alert content.
- **Data categories not listed today:** portfolio positions and transactions, watchlists, alerts, saved screens, waitlist (email, IP, referral source).
- **The cookies section is wrong:** the session is a localStorage JWT; the cookies come from third parties.
- **Cloudflare** as the proxy and infrastructure provider.
- **Retention periods:** active accounts, locked accounts (kept forever today), waitlist, logs.
- **Deletion:** the real request process and what happens to the Stripe, Postmark, Twilio and Anthropic copies (see S13).
- **The "Last updated" date** (Feb 25, 2026) predates AI, SMS and Clarity.
