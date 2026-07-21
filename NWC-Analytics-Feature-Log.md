# NWC-Analytics — Shipped Features Log

**Last Updated:** July 17, 2026  
**Purpose:** Cross-project reference document. Attach to NWC Marketing, NWC Blog/SM Post, NWC Enhancements, and NWC Sandbox projects so all workstreams have visibility into what has shipped, what tier it lives on, and what content angles it unlocks.

---

## How to Use This Document

Each entry follows a consistent format:
- **What It Does** — plain-language description for non-technical use
- **Tier Availability** — which subscription tiers include this feature
- **Marketing Angle** — the user problem it solves; use this for ad copy, email, social
- **Blog/Content Hooks** — potential post topics this feature supports
- **Date Shipped** — for sequencing content and announcements

---

## Features by Ship Date

---

### February 11, 2026

---

#### Live Price Architecture — Three-Layer Update System

**What It Does:** Established the core real-time price update system used across Portfolio and Watchlist pages. Prices load via a REST batch call on page mount, update instantly through a WebSocket connection streaming live trades, and fall back to 30-second polling for low-volume stocks where WebSocket trade events are sparse. Also fixed a critical bug in the batch price endpoint where prices were returning null — resolved by adding a fallback chain that tries multiple price sources in sequence before giving up.

**Tier Availability:** All tiers

**Marketing Angle:** Real-time price visibility is table stakes for any serious portfolio tracking tool. The three-layer architecture ensures users always see current prices regardless of whether they're holding high-volume large-caps or thinly traded small-caps — without requiring a manual refresh.

**Blog/Content Hooks:**
- How real-time stock prices actually work — the difference between trades, quotes, and snapshots
- Why low-volume stocks behave differently in live trading platforms
- Pre-market and after-hours pricing — what the data shows and what it doesn't

---

### February 16, 2026

---

#### Dividend Tracking — Stock Research Page

**What It Does:** Added a dividend data section to the Stock Research page showing cash amount, payment frequency, ex-date, pay date, and dividend yield for any dividend-paying stock or ETF.

**Tier Availability:** All tiers

**Marketing Angle:** Dividend investors need yield and payment history alongside price data when researching a stock — having to leave the platform to find it breaks the research workflow. Dividend data displayed in context makes NWC-Analytics a more complete single-stop research tool.

**Blog/Content Hooks:**
- How to evaluate dividend stocks — yield, payout ratio, and payment history explained
- Ex-date vs. pay date — what each means and why the difference matters
- Building a dividend income portfolio — how to think about yield sustainability

---

#### ETF & Fund Analytics Panel

**What It Does:** Added a fund-specific data panel to the Stock Research page that appears automatically when a user looks up an ETF or mutual fund. Displays investment objective, expense ratio, fund family, fund category, and total assets.

**Tier Availability:** All tiers

**Marketing Angle:** ETFs are among the most widely held instruments by retail investors yet most platforms show them like stocks — just a price chart. Surfacing expense ratios, fund family, and investment objectives gives users the context they actually need when comparing funds.

**Blog/Content Hooks:**
- ETF expense ratios explained — why 0.03% vs. 0.75% matters more than you think
- How to compare ETFs — what to look at beyond just the ticker and price
- Index funds vs. actively managed ETFs — the data behind the debate

---

#### Tutorials & Blog System with Admin Panel

**What It Does:** Built a complete content management system for tutorials and blog posts. Includes a WYSIWYG admin panel for creating and editing content, a tutorials page with YouTube video embeds and category filtering, and a public-facing blog accessible without a login. Blog posts are stored as HTML, support cover images, tags, and categories, and are publicly accessible via clean URL slugs. Signed-in users see the full platform nav on blog posts; visitors see a minimal public nav.

**Tier Availability:** Blog fully public (no account required); Tutorials require login

**Marketing Angle:** Content marketing is the primary organic growth channel for the platform. A native blog system means educational content lives on the platform domain rather than a third-party service — building SEO authority and giving visitors a path from article to signup without leaving the site.

**Blog/Content Hooks:**
- Meta: the blog system itself is the content engine — every post published feeds this channel
- Tutorial content drives user education and reduces support burden

---

#### Daily Snapshot Ingestion — OTC Stocks & Major Indices

**What It Does:** Enhanced the daily stock snapshot ingestion script to include OTC securities (ADRs, penny stocks, OTC-traded companies) and 8 major U.S. indices — S&P 500, Dow Jones, Nasdaq Composite, Nasdaq-100, VIX, Russell 2000, S&P MidCap 400, and S&P 100. Also updated the script to prefer current session data over prior-day data with a fallback. Total ticker coverage expanded from roughly 10,000 to over 16,600 securities.

**Tier Availability:** All tiers (powers screener, dashboard, and market data across the platform)

**Marketing Angle:** Broader data coverage means users researching less mainstream stocks — small caps, ADRs, OTC-traded foreign companies — get the same experience as users researching large-cap NYSE stocks. Index data powers the dashboard market overview that gives every user immediate market context on login.

**Blog/Content Hooks:**
- OTC stocks explained — what they are, how they trade, and what the risks are
- How major market indices work — what the S&P 500 actually measures and what it doesn't
- Small-cap vs. large-cap investing — why coverage depth matters when doing your own research

---

#### Forgot Password Flow

**What It Does:** Added a "Forgot password?" section to the login page that allows users to request a password reset via email. Users enter their email address, receive a branded reset link, and land on a dedicated reset password page to set a new password. Reset tokens are single-use and expire after one hour.

**Tier Availability:** All tiers

**Marketing Angle:** A missing password reset flow is a hard blocker for user retention — locked-out users churn rather than contact support. This closes a critical gap in the authentication experience.

**Blog/Content Hooks:** None — authentication infrastructure

---

#### Change Password — Account Settings

**What It Does:** Added a Change Password card to the Account Settings page. Users enter their current password, new password, and confirmation. The backend verifies the current password before accepting the change, enforces an 8-character minimum, and rejects the request if the new password matches the current one.

**Tier Availability:** All tiers

**Marketing Angle:** Basic account security feature expected by any subscription platform. Reduces support requests from users who need to rotate credentials.

**Blog/Content Hooks:** None — authentication infrastructure

---

#### Email Service — Multi-Sender Routing

**What It Does:** Refactored the email delivery service to route different email types through appropriate sender addresses — support emails (verification, password reset) send from the support address, payment confirmations send from the sales address. Each send method now initializes safely regardless of call order, eliminating a class of sequencing bugs that caused silent email failures.

**Tier Availability:** All tiers

**Marketing Angle:** Sender address consistency builds trust — a payment confirmation arriving from a support address, or worse a personal address, signals an unprofessional operation. Proper routing makes transactional emails look intentional and builds sender reputation per address.

**Blog/Content Hooks:** None — infrastructure

---

#### CORS Fix — www and Non-www Domain Coverage

**What It Does:** Updated the API's cross-origin policy to accept requests from both the www and non-www versions of the platform domain automatically. Previously, traffic arriving at the www subdomain was blocked at the OPTIONS preflight check, returning a 400 error before any API call could complete.

**Tier Availability:** All tiers — platform-wide fix

**Marketing Angle:** Silent API failures on the www subdomain meant a meaningful percentage of users arriving via typed URLs or certain link sources couldn't use the platform at all.

**Blog/Content Hooks:** None — infrastructure fix

---

### February 19, 2026

---

#### Alerts API — Delete, Update, and Create Bug Fixes

**What It Does:** Resolved three separate bugs preventing alerts from being reliably created, updated, or deleted. Trailing slashes in API calls were causing redirect failures, an HTTP method mismatch between frontend and backend was blocking updates, and frontend tier limits were misaligned with backend enforcement.

**Tier Availability:** All tiers

**Marketing Angle:** A broken alerts system is a trust-destroying bug — users who set a price alert and discover it silently failed have no reason to rely on the platform for time-sensitive decisions.

**Blog/Content Hooks:**
- How to use price alerts effectively — what to set them on and why
- Setting up a research workflow with alerts, watchlists, and technical indicators

---

#### Blog System — Sandboxed iFrame Rendering

**What It Does:** Replaced inline HTML rendering with a sandboxed iframe component for blog posts. Blog content authored in external editors with full HTML and CSS no longer conflicts with the platform's styling. The iframe automatically extracts the document body, preserves style blocks, injects base styles, and resizes dynamically to fit its content.

**Tier Availability:** All tiers (public — no login required)

**Marketing Angle:** Blog content is the primary organic acquisition channel. Content that renders with broken styles or layout conflicts undermines the platform's credibility with first-time visitors arriving from search or social.

**Blog/Content Hooks:** None — rendering infrastructure

---

#### Dashboard Performance Optimization

**What It Does:** Significantly improved Dashboard load speed and data freshness. API calls for watchlist, portfolio, and alerts now fire in parallel instead of sequentially. Portfolio prices now load fresh intraday data instead of prior-day closing prices. Added WebSocket live price integration with a visual flash animation on the portfolio value card when prices update, plus 30-second polling as a fallback.

**Tier Availability:** All tiers

**Marketing Angle:** The Dashboard is the first screen users see after login — slow loads and stale prices set a negative tone for the entire session. Fast, live data on the first screen signals a professional-grade platform.

**Blog/Content Hooks:**
- How to read your portfolio dashboard — what each metric is actually telling you
- Pre-market vs. real-time prices — why the number you see depends on when you look

---

#### SEO Infrastructure — Phase 1

**What It Does:** Added foundational SEO and discoverability infrastructure across the platform. Every page now has unique title tags and meta descriptions. Open Graph tags enable proper link previews when posts are shared on social media. JSON-LD structured data describes the platform to search engines. A sitemap.xml and robots.txt were added for crawler access, and canonical URLs prevent duplicate content indexing.

**Tier Availability:** All tiers (primarily benefits public-facing pages)

**Marketing Angle:** Without proper meta tags and a sitemap, blog content and landing pages are effectively invisible to search engines and render as blank previews when shared on Reddit, Twitter, or LinkedIn.

**Blog/Content Hooks:** None directly — but this is the infrastructure that makes every blog post findable

---

#### Financial Statements Integration — SEC Filing Data

**What It Does:** Integrated real SEC filing data into the platform. Income statements, balance sheets, and cash flow statements are now available for researched stocks, including trailing twelve months calculations from quarterly filings. Key ratios — P/E, EV/EBITDA, ROE, margins, and debt-to-equity — are displayed in a collapsible Financial Summary panel on the Technical Analysis page.

**Tier Availability:** All tiers with Technical Analysis access

**Marketing Angle:** Technical indicators tell you what a stock is doing — financials tell you whether the underlying business justifies it. Combining both on the same page eliminates the need to open a second tab to cross-reference fundamental data while doing technical research.

**Blog/Content Hooks:**
- How to read a cash flow statement — why FCF matters more than net income
- EV/EBITDA explained — the valuation multiple professionals actually use
- Combining technical and fundamental analysis — how to use both without contradicting yourself

---

#### DCF Valuation — Actual Financial Data Integration

**What It Does:** Upgraded the DCF model from sector-based default assumptions to real company financial data pulled from SEC filings. The model now auto-fills inputs with actual TTM free cash flow, revenue growth, diluted share count, and calculated WACC. A color-coded source badge tells users whether the FCF figure is actual SEC data, operating cash flow as a proxy, or an estimate — and a warning banner appears in results when estimated inputs are used. Negative intrinsic values now render in red. Added a seamless handoff from the Technical Analysis page that pre-populates the DCF with real data via URL parameters.

**Tier Availability:** Casual and above

**Marketing Angle:** A DCF model pre-filled with generic sector assumptions produces outputs that look precise but aren't grounded in the actual company. Using real SEC filing data — and being transparent about data quality with source badges — makes the valuation genuinely useful rather than decorative.

**Blog/Content Hooks:**
- What DCF valuation actually requires — why the inputs matter more than the formula
- Free cash flow vs. net income — which one to use in a DCF and why
- How to stress-test a DCF — varying growth rate and discount rate assumptions

---

#### Warrant Detection — API-Driven Classification

**What It Does:** Replaced regex-based warrant detection with API-driven classification using the security type field returned from the market data provider. Previously, legitimate stocks with tickers ending in "W" were incorrectly flagged as warrants. Now the API's own security classification is used as the source of truth, eliminating false positives. Applied consistently across Stock Research, DCF Valuation, and Technical Analysis pages.

**Tier Availability:** All tiers

**Marketing Angle:** Displaying a warrant warning on a legitimate common stock erodes user trust immediately — it signals the platform doesn't know what it's looking at. Accurate security classification is a basic credibility requirement for any research tool.

**Blog/Content Hooks:**
- What warrants are and how they differ from common stock
- How to identify warrant tickers and what to watch out for as a retail investor

---

### February 22, 2026

---

#### SMS Alerts — Twilio Integration & Phone Verification

**What It Does:** Added SMS text alert capability to the platform. Users can add and verify a phone number via a one-time passcode flow, then opt individual price alerts into SMS notification on creation or from the alert list. Verification is required before any SMS sends. Includes a new phone management API, OTP generation and validation, and Twilio integration for message delivery.

**Tier Availability:** Active and Professional

**Marketing Angle:** Email alerts require a user to check their inbox — SMS alerts reach them immediately wherever they are. For active traders monitoring a price target, the difference between an email and a text can be the difference between acting on an alert and missing it.

**Blog/Content Hooks:**
- How to set up price alerts and actually use them in your trading workflow
- Alert strategies for swing traders — what to set alerts on and why
- Setting price targets — how to pick meaningful levels worth alerting on

---

#### Background Alert Checker — Price Monitoring Engine

**What It Does:** Built the background service that actually monitors prices against active alerts and fires notifications when conditions are met. Previously alerts existed in the database but nothing ever evaluated them. The checker hooks into the live WebSocket price stream, evaluates price alerts on every trade tick with throttling to prevent database overload, marks triggered alerts as inactive, sends SMS via Twilio and styled HTML email via SendGrid, and broadcasts a real-time WebSocket event for frontend notifications.

**Tier Availability:** All tiers with alerts access

**Marketing Angle:** An alert system that never fires is worse than no alert system — it creates false confidence. The background checker is what makes the alerts feature real rather than decorative. Users can now set a price target, close the browser, and trust they'll be notified when it hits.

**Blog/Content Hooks:**
- How price alerts work under the hood — and why most retail platforms get them wrong
- Building a passive monitoring workflow — using alerts so you don't have to watch charts all day

---

#### Stripe Subscription Upgrade — Proration Fix

**What It Does:** Fixed a critical billing bug where upgrading a subscription tier created a second active subscription instead of modifying the existing one — resulting in users being charged for two plans simultaneously. The endpoint now detects whether a Stripe subscription already exists and either creates a new one (new subscribers) or modifies the existing one with prorated billing (upgrades).

**Tier Availability:** All tiers — billing infrastructure

**Marketing Angle:** Billing errors that double-charge users are an immediate trust-destroying and churn-inducing event. This fix ensures tier upgrades work correctly and that users are charged fairly for the prorated difference only.

**Blog/Content Hooks:** None — billing infrastructure fix

---

#### Pricing Page — Tier Navigation Bug Fix

**What It Does:** Fixed a bug where clicking an upgrade button on the Pricing page passed the display name of the tier to the payment page instead of the tier slug. The payment page couldn't resolve the display name to a valid tier configuration and silently defaulted to the wrong plan.

**Tier Availability:** All tiers — affects upgrade path

**Marketing Angle:** A broken upgrade flow is a direct revenue leak — users who click upgrade and land on the wrong plan either complete a wrong purchase or abandon the flow entirely.

**Blog/Content Hooks:** None — bug fix

---

#### Sector Explorer — Context Persistence

**What It Does:** Fixed a UX issue where clearing the search bar on the Stock Research page after arriving from a Dashboard sector pie chart would strip the sector context from the URL and reset the page to a blank state. The sector filter now persists independently of the search bar. Added an explicit dismiss button to exit sector mode intentionally, and a reshuffle button to load different stocks from the same sector without losing context.

**Tier Availability:** All tiers

**Marketing Angle:** The sector explorer is a discovery tool — users arriving from a sector pie chart are in research mode, not done yet. Losing their context on an accidental search clear interrupts the research workflow.

**Blog/Content Hooks:**
- How to use sector analysis to find stock ideas — starting broad and drilling down
- Sector rotation explained — how money moves between sectors and what it signals

---

### March 7, 2026

---

#### Dashboard — Quick Actions Removal

**What It Does:** Removed the Quick Actions button row from the Dashboard. The six buttons duplicated navigation already available in the nav bar directly above them, adding visual noise without adding functionality.

**Tier Availability:** All tiers

**Marketing Angle:** A cleaner Dashboard puts the actual data — portfolio value, market overview, sector breakdown — front and center.

**Blog/Content Hooks:** None — UI cleanup

---

#### DCF Valuation — Growth Profile Section

**What It Does:** Added a retrospective trend analysis section to the DCF Valuation page showing 12 quarters of historical data — revenue, gross margin, EPS, free cash flow, and year-over-year revenue growth — displayed as Recharts bar and line charts in a 2×2 grid. Includes a color-coded Rule of 40 badge. Renders only when data exists — gracefully absent for companies with no filing history.

**Tier Availability:** Casual and above

**Marketing Angle:** The DCF model answers "what would this company need to do going forward?" — the Growth Profile answers "what has it actually demonstrated?" Putting both on the same page lets users sanity-check their assumptions against real historical performance before committing to a valuation.

**Blog/Content Hooks:**
- What the Rule of 40 is and why SaaS investors use it as a benchmark
- How to read a company's revenue trend — what acceleration and deceleration signal
- Using historical FCF trends to stress-test your DCF assumptions

---

#### Subscription Status — API Route Fix

**What It Does:** Fixed a 404 error on the Dashboard caused by the subscription status API call pointing to the wrong route prefix. The Stripe router is mounted at `/stripe/` in the backend but the frontend was calling `/payments/` — a mismatch that silently broke subscription status display for all users.

**Tier Availability:** All tiers

**Marketing Angle:** A broken subscription status call means users can't see their current tier on the Dashboard — a confusing experience that undermines confidence in the platform's reliability.

**Blog/Content Hooks:** None — bug fix

---

#### Registration Payment Flow — Tier Passthrough Fix

**What It Does:** Fixed a broken registration flow where the selected subscription tier was never passed to the backend during signup. Users who registered and picked a tier were sent a verification email with no tier context — clicking the link dropped them to the Dashboard instead of routing them through Stripe checkout.

**Tier Availability:** All tiers — affects new user onboarding

**Marketing Angle:** A broken signup-to-payment flow is a direct revenue blocker. Users who pick a paid tier, verify their email, and land on the Dashboard instead of checkout churn before their first payment.

**Blog/Content Hooks:** None — onboarding bug fix

---

#### Domain Migration — nwc-analytics.com

**What It Does:** Migrated the platform's primary domain from northwestcreekllc.com to nwc-analytics.com. Cloudflare configured for DNS with CNAME flattening. Railway custom domains added for both www and non-www versions. SSL/TLS set to Full (Strict) mode to prevent redirect loops.

**Tier Availability:** All tiers — platform-wide

**Marketing Angle:** nwc-analytics.com is a significantly more descriptive and memorable domain for a stock analytics platform — it communicates what the product does at a glance, which matters for search, word-of-mouth, and first impressions from any marketing channel.

**Blog/Content Hooks:** None — infrastructure migration

---

### March 10, 2026

---

#### Stock Research Page — Live Price Overlay

**What It Does:** Added intraday price fetching to the Stock Research page. Previously the page displayed prior-day closing prices — the only page on the platform not wired to live data. After the initial quote loads, the page now fetches a fresh intraday batch price and overlays the current price, change, and change percentage. If the intraday fetch fails the prior-day quote displays as a fallback.

**Tier Availability:** All tiers

**Marketing Angle:** Showing yesterday's closing price on a stock research page while the market is open is a credibility problem — users notice immediately when the price doesn't match their brokerage.

**Blog/Content Hooks:**
- Real-time vs. delayed quotes — what the difference means for retail investors
- How to research a stock effectively — combining live price context with fundamental and technical data

---

#### DCF Valuation — Financial Data Staleness Detection

**What It Does:** Added a two-layer staleness detection system to the Growth Profile section. The primary check detects CIK mismatches — cases where a ticker has been reused by a different company and the financial data belongs to a prior entity. The fallback check flags data where the most recent quarterly filing is older than 270 days. Stale profiles display a warning banner and suppress the Rule of 40 badge.

**Tier Availability:** Casual and above

**Marketing Angle:** A DCF model pre-filled with financial data from a company that no longer exists under that ticker — or data that's two years old — produces a dangerously misleading valuation. Surfacing staleness explicitly rather than silently displaying bad data is a meaningful trust differentiator.

**Blog/Content Hooks:**
- Ticker reuse — the obscure market mechanic that can corrupt your financial research
- Why data quality matters more than model sophistication in DCF valuation

---

#### Technical Analysis — Weighted Sentiment Scoring

**What It Does:** Replaced a binary indicator count driving the overall sentiment summary with a weighted scoring system. Trend indicators (MACD, ADX, Moving Averages, Ichimoku Cloud) carry double weight over oscillators and confirmation indicators. Purely volatility-based indicators with no directional signal are excluded entirely. Maps to five sentiment levels: Strong Bullish, Bullish, Neutral, Bearish, Strong Bearish. New response fields expose the raw score, indicator count, and a full breakdown of which indicators contributed.

**Tier Availability:** All tiers with Technical Analysis access

**Marketing Angle:** Treating a Bollinger Band touch the same as a MACD crossover in a sentiment summary produces misleading signals. The weighted system reflects how experienced technical analysts actually prioritize indicators, making the platform's overall signal more trustworthy and less noisy.

**Blog/Content Hooks:**
- Why not all technical indicators are equal — trend vs. momentum vs. volatility explained
- How to read the NWC-Analytics sentiment summary — what the score is actually measuring
- MACD vs. RSI — why one matters more for trend confirmation than the other

---

### Q1 2026

---

#### Smart Technical Alerts — Rule of 40 and Sentiment Shift

**What It Does:** Added two new technical alert types — Rule of 40 (a SaaS profitability composite tracking revenue growth plus FCF margin) and Sentiment Shift (a configurable overall indicator sentiment change alert). Both deliver via email and store configuration as structured data per user.

**Tier Availability:** Active (5 technical alerts) and Professional (20 technical alerts)

**Marketing Angle:** Rule of 40 alerts serve SaaS-focused investors who want to be notified when a company's growth-profitability balance crosses a meaningful threshold. Sentiment shift alerts automate the job of watching overall indicator consensus rather than checking manually.

**Blog/Content Hooks:**
- The Rule of 40 — how SaaS investors evaluate growth vs. profitability
- Alert fatigue — how to configure technical alerts you'll actually trust

---

### April 21, 2026

---

#### Stock Screener — API Router (Run & Presets Endpoints)

**What It Does:** Built the core API layer powering the Stock Screener — a POST endpoint that filters stocks against 15+ criteria (price, market cap, volume, MA crossovers, distance from 52-week high/low, dollar volume, and more) and returns paginated, sorted results from NWC-Analytics' own database updated every 15 minutes. Also includes a public GET endpoint serving five built-in preset screens: Near 52-Week High, Oversold Quality, Golden Cross, High Volume Breakout, and Momentum Leaders.

**Tier Availability:** All tiers

**Marketing Angle:** Gives retail investors the ability to surface actionable stock ideas in seconds using institutional-style screening criteria — without needing a Bloomberg Terminal. The preset screens lower the barrier for users who don't yet know how to build their own filters.

**Blog/Content Hooks:**
- How to use the NWC-Analytics Stock Screener — a walkthrough of each preset
- What the Golden Cross is and why traders watch it
- How to find stocks near 52-week highs — momentum signal or warning sign?

---

### April 22, 2026

---

#### Stock Screener — Presets Expansion (9 Total)

**What It Does:** Expanded the Stock Screener from 5 to 9 preset screens by adding Near 52-Week Low, Death Cross, Gap Up (2%+), and Gap Down (2%+). Also introduced two new underlying filter criteria — Death Cross (50-day MA below 200-day MA) and Gap Percent (today's open vs. prior close).

**Tier Availability:** All tiers

**Marketing Angle:** More presets mean more immediately actionable ideas for users who don't yet know how to build custom screens. Gap presets serve active traders looking for momentum and catalyst plays each morning; Near 52-Week Low and Death Cross serve contrarian and risk-aware investors.

**Blog/Content Hooks:**
- What the Death Cross is and what it historically signals — and what it doesn't
- Gap ups and gap downs explained — how to interpret them and why they matter at the open
- Contrarian investing 101 — why some traders hunt stocks near 52-week lows

---

### April 23, 2026

---

#### Intraday Chart — Scroll-to-Zoom

**What It Does:** Added mouse wheel zoom to the intraday 1-minute bar chart in the Stock Screener. Users scroll up over the chart to zoom into a specific time window and scroll back out to return to the full trading day view. A "Reset Zoom" button appears in the toolbar while zoomed, and the bar count label updates to show the visible window versus total bars (e.g. "45 / 390 bars"). Zoom resets automatically when switching tickers.

**Tier Availability:** All tiers

**Marketing Angle:** 390 one-minute bars on a single chart is useful for spotting trends but hard to inspect in detail. Scroll-to-zoom brings a standard professional charting interaction to the platform — the kind of behavior traders expect from institutional tools — without requiring additional clicks or mode switching.

**Blog/Content Hooks:**
- How to read intraday charts — what 1-minute bars reveal that daily charts don't
- Intraday trading patterns retail investors should know
- A walkthrough of the NWC-Analytics Stock Screener chart panel

---

### April 28, 2026

---

#### MVWAP Rename + True Intraday VWAP Modal

**What It Does:** Renamed the existing VWAP indicator to MVWAP (Multi-Day VWAP) to accurately reflect that it computes a cumulative running average across the selected date range rather than resetting each session. Clicking the MVWAP summary card now opens a modal showing a true single-session intraday VWAP — calculated from 1-minute bars, resetting at market open — displayed as a dashed amber line overlaid on a price area chart. The modal footer shows the current VWAP value, current price, and an ABOVE/BELOW signal badge.

**Tier Availability:** All tiers (MVWAP chart); Advanced Charts required for intraday data (Casual and above)

**Marketing Angle:** True intraday VWAP is one of the most widely used institutional trading benchmarks — it tells traders whether price is tracking above or below where the market has been doing business all day. Surfacing it as a one-click modal gives retail investors access to a signal that previously required dedicated intraday charting software.

**Blog/Content Hooks:**
- What VWAP actually measures and why institutions use it as a benchmark
- MVWAP vs. VWAP — the difference between multi-day and session-reset calculations
- How to use intraday VWAP to time entries and exits

---

### May 4, 2026

---

#### Options Calculator — Spreads Tab Input Cleanup

**What It Does:** The Spreads tab in the Options Calculator previously displayed a Strike Price and Option Type field that were non-functional — the Strike Price was hardcoded to $155.00 and did nothing. These fields are now hidden on the Spreads tab since Spreads uses its own Lower/Upper Strike inputs and determines call/put automatically from the selected strategy. The remaining four fields reflow into a clean single-row layout.

**Tier Availability:** Active and Professional

**Marketing Angle:** Removes a confusing UI artifact that made the Spreads tab look broken to new users — a field stuck at $155.00 with no explanation erodes trust in the tool.

**Blog/Content Hooks:**
- How options spreads work and why they need different inputs than single-leg options
- A walkthrough of the Options Calculator's Spreads tab and the four strategies it supports
- UI/UX decisions in financial tools — why clarity matters when real money is involved

---

#### Sector Rotation Heatmap — New Page

**What It Does:** New full-page visualization showing the relative performance of all 11 GICS sector ETFs (XLK, XLV, XLF, XLY, XLC, XLE, XLP, XLI, XLU, XLRE, XLB) versus SPY as an equal-tile treemap. Color encodes how much each sector is out- or under-performing the broader market — teal for outperformance, red for underperformance, saturating at ±5% — so leadership and laggards are visible at a glance. Users pick a lookback window (1 day to 1 year) and an as-of date, and each tile shows the sector's absolute return with a hover tooltip breaking out return and vs-SPY figures. The standout capability is **time-lapse mode**: one click loads a frame-by-frame history of the selected window and users can scrub a slider, press play to animate it, or step frame-by-frame (forward and backward step buttons added May 30 and July 16) — literally watching money rotate between sectors over time. Data comes from the platform's own daily sector ETF close history, refreshed by the existing snapshot cron.

**Tier Availability:** All tiers (any authenticated subscriber)

**Marketing Angle:** Sector rotation is how professionals read the market's internals, but the standard retail view is a static one-day heatmap. Making the heatmap scrubbable through time turns a snapshot into a story — users can watch defensive sectors take leadership before a pullback or see a risk-on rotation forming in real time. It's also one of the platform's most visually distinctive and demo-friendly features: a playing time-lapse is inherently screenshot- and video-ready for social content.

**Blog/Content Hooks:**
- How to read a sector rotation heatmap — what outperformance vs. SPY actually tells you
- The 11 GICS sectors explained — what's in each and how they behave across the cycle
- Watching money rotate — using the time-lapse to spot leadership changes early
- Defensive vs. cyclical sectors — what leadership shifts signal about market sentiment

---

#### Sector Heatmap — White-Screen Crash Fix

**What It Does:** Resolved a crash that caused the Sector Heatmap page to render for one frame and then go completely white. The root cause was a Recharts 3.x compatibility issue where custom data fields weren't being passed directly to the tile render function as expected — accessing an undefined value on render killed the entire React tree. Fixed by reading fields defensively and replacing a broken Recharts tooltip implementation with a native SVG title element.

**Tier Availability:** All tiers

**Marketing Angle:** A white-screen crash on a visible page erodes trust immediately — users assume the platform is broken. Restoring the Sector Heatmap to stable operation preserves confidence in the platform and keeps one of the more visually distinctive features accessible.

**Blog/Content Hooks:**
- How to use sector heatmaps to spot rotation — where is money moving right now?
- Sector performance vs. SPY — what outperformance and underperformance signals about market sentiment
- Understanding sector rotation as a portfolio management tool

---

### May 5, 2026

---

#### Sector Heatmap — "Where We Are in the Cycle" AI Macro Panel

**What It Does:** Added an AI-synthesized economic cycle analysis panel to the Sector Rotation Heatmap page. The platform pulls live macro data from FRED — the Fed funds rate, unemployment rate, and 10Y-minus-2Y yield spread, plus CPI year-over-year and annualized real GDP growth computed from the raw series — and combines it with the current 3-month sector rotation picture. Claude then synthesizes which business-cycle phase the data is consistent with (Recovery, Expansion, Peak, or Contraction), displayed as a color-coded phase badge with a confidence level, a plain-language summary, a card for each supporting macro signal with its current value and interpretation, and a "Sector Alignment" paragraph assessing whether current sector leadership matches or contradicts the diagnosed phase. The analysis regenerates once per day system-wide — one AI call serves all users — and the panel carries an explicit "educational context, not a trading signal" disclaimer with a link to the sector rotation framework on the blog. If synthesis is unavailable the panel hides silently rather than showing an error above the heatmap.

**Tier Availability:** All tiers (any authenticated subscriber)

**Marketing Angle:** Retail investors constantly hear "we're late cycle" or "the yield curve says recession" without the tools to evaluate those claims. This panel puts the actual numbers, what each one means, and a synthesized read on the same screen as the sector performance data it should explain — connecting macro to the sector rotation playbook in one view. The honest framing (confidence level, explicit disclaimer, and a sector-alignment section willing to say the data *doesn't* fully match a classic pattern) reinforces the platform's trustworthy-signal positioning rather than overclaiming predictive power.

**Blog/Content Hooks:**
- The four phases of the business cycle — and which sectors historically lead in each
- The yield curve explained — what 10Y minus 2Y actually measures and why everyone watches it
- How to read the Fed — funds rate, inflation, and what "restrictive" really means
- Sector rotation framework — the full playbook behind the cycle panel (the panel links here)

---

### May 15, 2026

---

#### Portfolio Dividend Income — Export to CSV

**What It Does:** Added an Export CSV button to the Dividend Income modal on the Portfolio page. Clicking it downloads a complete payment history for all dividend-paying positions as a CSV file — one row per actual dividend payment received, including ticker, shares held, ex-date, pay date, dividend per share, total payment, and distribution type. The export includes the full payment history, not just the 6 most recent payments shown in the modal. File is named with today's date and opens correctly in Excel, Google Sheets, and tax software.

**Tier Availability:** All tiers

**Marketing Angle:** Dividend investors track actual cash received throughout the year for tax reporting, income planning, and yield verification. One-click CSV export turns the platform into a practical tax-prep and income-tracking tool, not just a research platform.

**Blog/Content Hooks:**
- How to track dividend income for tax reporting — what you need and when you need it
- Qualified dividends vs. ordinary dividends — why the distinction matters at tax time
- Building a dividend income portfolio — how to think about yield, payout history, and coverage ratios

---

### May 20, 2026

---

#### Fibonacci Drawing Tool — Convention Fix

**What It Does:** Corrected the Fibonacci retracement tool on the Price History and Screener Chart pages so that 0% lands at the second click (end of the move), matching the TradingView convention. Button labels were updated to "Click start of move" and "Click end of move (0%)" to make the click order explicit. Previously the 0% and 100% labels were reversed, making drawn levels misleading for traders with existing platform experience.

**Tier Availability:** All paid tiers

**Marketing Angle:** Retail traders arriving from TradingView had the 0%/100% labels flipped, making the tool untrustworthy for anyone who already knew how to use Fibonacci retracement. The tool now behaves exactly as muscle memory expects.

**Blog/Content Hooks:**
- How to use Fibonacci retracement to find support and resistance
- Fibonacci levels explained — what 0%, 61.8%, and 100% actually mean
- The golden ratio in trading — why 61.8% matters to technical analysts

---

#### Technical Analysis — Momentum Indicator Cards Visual Consistency Fix

**What It Does:** Updated the four Momentum indicator summary cards (Stochastic, ADX, CCI, ROC) on the Technical Analysis page to match the boxed card style used by Volume, Volatility, and Trend indicators — white/dark-mode box with border, shadow, bold title, color-coded badge showing the current reading, and description text. Previously they rendered as plain centered paragraph tags in a flat gray cell.

**Tier Availability:** All paid tiers

**Marketing Angle:** The Advanced Indicators section is a premium feature — inconsistent styling signals an unfinished product and undermines confidence in the data behind it. Visual consistency across all indicator cards signals a professional-grade platform.

**Blog/Content Hooks:**
- Stochastic, ADX, CCI, ROC — what each momentum indicator tells you
- How to combine momentum indicators to confirm a trade setup
- ADX and the myth of direction — why trend strength is not the same as trend direction
- CCI and ROC — the underrated momentum tools most retail traders ignore

---

#### Intraday Modal Chart — Height Fix

**What It Does:** Reduced the intraday popup chart height from 480px to 360px so the full chart including x-axis time labels is visible within the modal without scrolling.

**Tier Availability:** All tiers

**Marketing Angle:** Removes friction when users click into an intraday chart from the screener or watchlist — the full picture is immediately visible without requiring a scroll.

**Blog/Content Hooks:**
- How to read an intraday chart
- Screener walkthrough — finding breakouts before they happen

---

#### Stock News Feed — Parameter Fix

**What It Does:** Fixed a bug where the Latest News section on the stock detail page returned "No recent news available" for all tickers despite news data existing. Root cause was a single incorrect parameter name in the API call — `symbol` instead of `symbols` — that caused every news request to return empty.

**Tier Availability:** All tiers

**Marketing Angle:** News is a core research input for retail investors. A working news feed directly next to price data reduces the tab-switching that makes retail research painful and keeps users on the platform longer.

**Blog/Content Hooks:**
- How to use news sentiment in your stock research workflow
- Combining price action and news — how to avoid being the last to know

---

#### Stock News — General Market News Fallback

**What It Does:** When a selected stock has no ticker-specific news available, the Latest News section now displays a clear "No recent news available for {ticker}" message and fills the section with three randomly selected general financial market news articles. Previously the section showed an empty state with no content.

**Tier Availability:** All tiers

**Marketing Angle:** Users researching low-coverage stocks — small-caps, speculative names, emerging-market ADRs — no longer hit a blank wall. The news section always has something relevant to read, keeping users in the research flow rather than bouncing to Google Finance or Seeking Alpha.

**Blog/Content Hooks:**
- How to research stocks with limited analyst coverage
- Small-cap research — what to look for when Wall Street isn't watching

---

#### Company Name Search — FMP Endpoint Fix

**What It Does:** Fixed a bug where searching by company name (e.g., "Tesla" instead of "TSLA") returned zero suggestions. The backend was calling a non-existent FMP endpoint for name matching that silently returned nothing. Corrected to the proper search-name endpoint. Ticker and name searches now run in parallel with results merged — ticker matches ranked first.

**Tier Availability:** All tiers

**Marketing Angle:** Retail investors think in company names, not ticker symbols. A new user searching "Apple" or "Nvidia" should get instant results — this is table-stakes UX that directly affects first-session conversion.

**Blog/Content Hooks:**
- Ticker symbols explained — what AAPL, TSLA, and NVDA actually mean
- Getting started with NWC-Analytics — finding any stock in seconds

---

#### Live Ticker Tape — Most-Active Tickers

**What It Does:** Added a full-width continuously scrolling strip to the public landing page showing real-time price and percent-change data for up to 15 of the day's most actively traded U.S. stocks. Data is sourced from FMP, cached server-side for 60 seconds, pauses on hover, and respects reduced-motion accessibility preferences. No login required.

**Tier Availability:** Public — no login required

**Marketing Angle:** Visitors see live market data the moment they land on the page before signing up. This immediately signals that the data is real and current — the single most important trust signal for a market data platform.

**Blog/Content Hooks:**
- Why most-active stocks matter more than trending stocks
- Volume as a leading indicator — what the tape is telling you

---

#### Landing Page Hero — Redesign with Animated AI Demo Card

**What It Does:** Replaced the static screenshot hero with a two-column layout — headline copy on the left and an animated demo card on the right. The demo card shows a mock AAPL analysis with a typewriter-effect AI summary, a sparkline chart, and static RSI/DCF/Trend indicators. No live API call is made from the public landing page.

**Tier Availability:** Public — no login required

**Marketing Angle:** Shows rather than tells. A visitor can read the AI summary and see the indicators in under five seconds and understand exactly what the product does — converting passive curiosity into active interest before the CTA buttons are even read.

**Blog/Content Hooks:**
- What does an AI stock analysis actually look like?
- RSI, DCF, and trend signals — a plain-English guide for retail investors
- Why we built AI stock analysis for individual investors

---

#### Landing Page — "How It Works" Section

**What It Does:** Replaced an abstract stats strip with three numbered action cards: "Sign Up Free → Search Any Ticker → Get Institutional-Grade Analysis." Makes the onboarding path immediately legible to a first-time visitor.

**Tier Availability:** Public — no login required

**Marketing Angle:** Stats like "15+ indicators" are meaningful to existing users — numbered steps are meaningful to prospects who don't yet know what indicators are. Reduces the cognitive barrier between landing and signing up.

**Blog/Content Hooks:**
- Getting started with NWC-Analytics — your first analysis in 3 steps
- From signup to your first DCF valuation — a walkthrough

---

#### Landing Page — Browser Chrome Frame for Feature GIFs

**What It Does:** Added a browser-chrome wrapper to the feature section screenshot component. When enabled, images or GIFs are framed with a faux browser-window header — three traffic-light dots and an nwc-analytics.com URL pill — with a soft teal radial glow. Currently applied to the AI Stock & Portfolio Analysis feature section.

**Tier Availability:** Public — no login required

**Marketing Angle:** Contextualizes product screenshots as happening inside a real application. Browser chrome is a widely recognized visual shorthand on SaaS landing pages that adds credibility without requiring explanation.

**Blog/Content Hooks:**
- A look inside NWC-Analytics — AI stock analysis in action

---

#### LandingV2 — Full Alternate Landing Page

**What It Does:** Built a complete alternate landing page at /landing-v2 for side-by-side evaluation against the live page before committing to a full swap. Includes sticky navbar, live ticker tape, two-column hero, 4-pillar feature grid, screenshot section, How It Works steps, data sources strip, pricing section with monthly/annual toggle, FAQ accordion, final CTA, and footer. CSS-only animations, no new dependencies. Ready to go live with a single route change in App.tsx when approved.

**Tier Availability:** Public — no login required

**Marketing Angle:** Provides a modern conversion-focused design to evaluate against the existing page — ready to deploy immediately when approved.

**Blog/Content Hooks:**
- Why we rebuilt our landing page — a behind-the-scenes post

---

#### Extended-Hours Quotes — PM/AH Badges

**What It Does:** Pre-market and after-hours quotes now display PM and AH badges so users know when they're looking at off-hours data rather than regular session prices. Affects the watchlist, dashboard, and stock detail views.

**Tier Availability:** All tiers

**Marketing Angle:** Pre-market and after-hours moves have different implications — a pre-market gap often reflects overnight news while an after-hours move typically reflects earnings or announcements. Labeling them distinctly gives users actionable context rather than an ambiguous extended-hours number.

**Blog/Content Hooks:**
- Pre-market vs. after-hours trading — what retail investors need to know
- Why the price you see after hours isn't always the price you'll get at open
- Earnings gaps — how to interpret the move before the open

---

#### DCF Valuation — Conservative Growth Rate Haircut

**What It Does:** Refined the AI-suggested DCF inputs to apply a 20% conservative haircut to historically derived growth rates and to use date-matched year-over-year revenue comparisons rather than index-matched comparisons. This produces more defensible starting assumptions and corrects distortion that affected seasonal businesses where same-period comparisons matter.

**Tier Availability:** All tiers with DCF access

**Marketing Angle:** Auto-suggested inputs grounded in actual historical revenue with a built-in conservatism margin remove the hardest cognitive hurdle in DCF modeling — users spend time on judgment rather than arithmetic, and the starting point is already defensible rather than optimistic.

**Blog/Content Hooks:**
- Growth rate assumptions — the one number that breaks most DCF models
- Why we apply a conservative haircut to AI-suggested DCF inputs

---

#### Saved Screener Screens — Tier-Gated Persistence

**What It Does:** Active and Professional users can name and save any screener filter configuration for one-click reload. Saved screens persist across sessions and appear in a My Screens panel. Beginner and Casual users can run all screener filters but cannot save configurations — they see an upgrade prompt when they attempt to save. Limits are 15 saved screens for Active and 50 for Professional.

**Tier Availability:** Active (15 saves) and Professional (50 saves); Beginner and Casual can run but not save

**Marketing Angle:** A screener that requires re-entering the same filters every morning is a chore. Saved screens turn a daily research habit into a one-click action — for users who run the same 2–3 screens before market open this is the difference between a tool that fits a workflow and one that creates work before it starts working.

**Blog/Content Hooks:**
- My morning pre-market routine — how to find setups in 10 minutes with saved screens
- The 3 screens every active investor should run before market open
- Building a repeatable research process with saved screener filters

---

#### Landing Page — Shared Pricing Data Source (pricingTiers.ts)

**What It Does:** Extracted tier names, prices, and feature bullets into a single shared TypeScript file consumed by the Landing page, Pricing page, RegisterWithPayment, and Payment pages. Previously each page maintained its own copy of pricing data — changes required updates in four places with risk of inconsistency.

**Tier Availability:** Public — infrastructure change affecting all pages

**Marketing Angle:** Pricing inconsistencies across pages erode trust at the moment of purchase decision. A single source of truth eliminates that risk entirely.

**Blog/Content Hooks:** None — infrastructure

---

### May 21, 2026

---

#### Pre-Market / After-Hours — Timestamp-Based Classification

**What It Does:** Enhanced extended-hours price data to distinguish between pre-market (before 9:30 AM ET) and after-hours (after 4:00 PM ET) using timestamp-based classification on FMP's aftermarket trade data. Users see whether price movement happened pre-market or after-hours rather than a generic extended-hours label.

**Tier Availability:** All tiers

**Marketing Angle:** Pre-market and after-hours moves have different implications. Labeling them distinctly gives users actionable context for overnight gaps and earnings reactions.

**Blog/Content Hooks:**
- How to read pre-market vs. after-hours price action
- Why extended-hours trading matters for retail investors
- Earnings gaps — how to interpret the move before the open

---

#### Smart Trading Day Lookback — Holiday Awareness

**What It Does:** Integrated FMP's exchange holidays endpoint into lookback window calculations for intraday bars. The system now skips weekends and market holidays when calculating historical windows, preventing wasted API calls and eliminating data gaps caused by non-trading days in chart and moving average calculations.

**Tier Availability:** All tiers

**Marketing Angle:** Charts and moving averages that silently include non-trading days produce slightly wrong calculations and visual gaps. Holiday-aware lookback windows produce cleaner data with no user-visible artifacts.

**Blog/Content Hooks:**
- How market holidays affect technical analysis data
- Why your moving averages might be slightly off — and how we fixed it

---

#### TTM Financial Ratios & Key Metrics

**What It Does:** Replaced quarterly ratio snapshots with FMP's pre-computed Trailing Twelve Months (TTM) endpoints. Users now see annualized P/E, P/S, P/B, ROE, ROA, and debt-to-equity ratios that always reflect the latest four quarters — without waiting for annual report cycles.

**Tier Availability:** All tiers (Financials page)

**Marketing Angle:** Quarterly snapshots can be stale or skewed by seasonality. TTM ratios normalize across four quarters and reflect current performance — the standard professional analysts use when comparing companies.

**Blog/Content Hooks:**
- Why trailing twelve months matters more than last quarter
- Understanding TTM ratios — the standard professionals actually use
- How to compare stocks using TTM metrics

---

#### Moving Average Overlays — FMP SMA Endpoints

**What It Does:** Replaced local moving average computation — which required fetching 365 days of daily bars and calculating in-app — with three parallel calls to FMP's SMA endpoint for 20, 50, and 200-day moving averages. Faster, lighter, and uses institutional-quality pre-computed values.

**Tier Availability:** All tiers (intraday chart MA overlays)

**Marketing Angle:** Faster chart loading with more accurate moving average overlays. Eliminates the latency of fetching a year of daily bars just to compute three numbers that FMP already has.

**Blog/Content Hooks:**
- Using 20/50/200-day moving averages to spot trends
- The golden cross and death cross explained

---

#### DCF Valuation — FMP Benchmark Comparison

**What It Does:** Added FMP's simple DCF, levered DCF, and custom DCF (WACC, terminal value, enterprise value) as benchmark comparisons alongside the NWC-Analytics DCF calculator. Users can see how their assumptions and output compare to an independent model — two perspectives on intrinsic value on the same page.

**Tier Availability:** Paid tiers (DCF Valuation page)

**Marketing Angle:** A single DCF output in isolation is hard to evaluate. A side-by-side benchmark from an independent model gives users a sanity check without requiring them to run the calculation twice elsewhere.

**Blog/Content Hooks:**
- How to cross-check your DCF valuation
- Levered vs. unlevered DCF explained
- What WACC tells you about a company's cost of capital

---

#### Earnings Calendar

**What It Does:** New endpoint and page section showing upcoming earnings reports for U.S. stocks within a configurable 1–30 day window, including analyst EPS and revenue estimates alongside actuals for past reports.

**Tier Availability:** All tiers

**Marketing Angle:** Earnings are the single most reliably price-moving event for individual stocks. Users who hold positions or are watching a name need to know when earnings are coming — a built-in calendar eliminates the need to check a separate site before every session.

**Blog/Content Hooks:**
- How to prepare for earnings season as a retail investor
- EPS beats and misses — what they actually mean for stock prices
- Building an earnings calendar strategy — how to position before announcements

---

#### ETF Info & Holdings

**What It Does:** Two new endpoints providing ETF metadata (expense ratio, AUM, fund description, sector weightings) and full holdings breakdowns (top holdings with weight, share count, and market value). Replaces the earlier yfinance-based ETF data with FMP's more comprehensive and reliable feed.

**Tier Availability:** All tiers

**Marketing Angle:** Most retail investors buy ETFs without knowing what's actually inside them. Surfacing holdings and sector weightings in the same research workflow as individual stocks lets users make genuinely informed allocation decisions.

**Blog/Content Hooks:**
- What's inside your ETF — how to evaluate holdings before you buy
- How to compare ETFs by expense ratio, AUM, and sector exposure
- Sector diversification through ETFs — what the holdings actually show

---

#### Fundamental Company Screener

**What It Does:** A full stock screener on the Stocks page that filters the ~5,000-name daily snapshot universe on both fundamental and technical criteria in one panel. Fundamental filters: price, market cap, daily change %, **dividend yield %** (min/max), **beta** (min/max), sector, and industry (the industry dropdown is data-driven and narrows to the chosen sector). Liquidity filters: trading volume and dollar volume. Positioning filters: % from 52-week high/low, plus moving-average conditions (Golden Cross, price above 50-day MA, price above 200-day MA) and the full volatility-squeeze set (in-squeeze, minimum days coiling, maximum BB÷KC tightness, and fired-within-N-days). Universe controls: exchange toggles (NYSE / NASDAQ / AMEX) and an "Exclude ETFs & Funds" checkbox that is on by default. Results are sortable by any core column — including dividend yield and beta — paginated, stamped with a "data as of" time, and each row opens an inline price chart (Active/Professional). The screener ships with one-click presets — Near 52-Week High, Oversold Quality, Golden Cross, High Volume Breakout, Momentum Leaders, Near/at 52-Week Low, Death Cross, Gap Up, Gap Down, **Dividend Income**, In Squeeze, and Squeeze Fired — and users can save their own screens (count gated by tier). Dividend yield is derived from each company's trailing annual dividend (captured on the daily universe rebuild from FMP's company-screener) against the live price, so a non-payer reads as no yield rather than a misleading zero.

**Tier Availability:** All tiers can run the screener, use presets, and filter by dividend yield. Saved-screen count is tier-gated; the inline per-result price chart is Active and Professional.

**Marketing Angle:** The technical screener finds setups — this one finds companies. Income and value investors can build a candidate universe by dividend yield, market cap, and sector, then layer on moving-average and squeeze conditions to time an entry — a full top-down research workflow without leaving the platform. The dividend-yield filter directly serves income investors (with a one-click Dividend Income preset for "quality names paying 3%+"), while the beta filter lets risk-conscious investors screen for defensive, low-volatility names or, conversely, high-beta movers — matching the candidate universe to their risk tolerance before they ever look at a chart.

**Blog/Content Hooks:**
- How to build a stock screener strategy from fundamentals down to technicals
- Screening for dividend income — yield, market cap, and quality filters that matter
- What beta really measures — building a low-volatility (or high-beta) watchlist
- Finding undervalued stocks with market cap and sector filters
- Small-cap vs. large-cap — using screener filters to match your risk tolerance

---

### June 7, 2026

---

#### Bankruptcy Detection — Stock Research Page

**What It Does:** Automatically flags when a company has a recent bankruptcy or receivership filing on record by reading SEC 8-K item codes directly from SEC EDGAR and detecting Item 1.03 (Bankruptcy or Receivership) within the trailing ~18 months. When detected, the Stock Research page suppresses the going-concern valuation lines — NWC AI target price, analyst price target, and forward P/E — since these models assume the company keeps operating and existing equity is typically cancelled in restructuring. A red "Bankruptcy / Receivership" flag appears in the Company Details panel with the filing date and a direct link to the 8-K, and the Dilution Filings section gets a note explaining that any S-3 or 424B5 shelf filings shown are pre-petition and rendered moot by the restructuring. The flag is intentionally worded conservatively — it confirms a filing exists and links to the source rather than asserting the chapter or that proceedings are still active.

**Tier Availability:** All tiers (Stock Research page)

**Marketing Angle:** Showing a confident AI price target and analyst upside on a company in bankruptcy is exactly the kind of misleading signal that erodes trust in a research tool — retail investors have lost money buying "cheap" bankrupt stocks whose equity was about to be wiped. Surfacing the bankruptcy filing front-and-center, and deliberately hiding valuation models that don't apply, is a strong trust and investor-protection differentiator most retail platforms don't bother with.

**Blog/Content Hooks:**
- What happens to a stock when a company files Chapter 11 — why the equity usually goes to zero
- How to read an 8-K — the SEC filing items that actually move stocks (1.03, 2.01, 5.02)
- Why a low share price isn't a discount — the bankruptcy trap retail investors fall into

---

#### Admin Maintenance Console — AI-Assisted Vendor Changelog Review

> **Internal tool — not a public or subscriber-facing feature.** Logged here for cross-project visibility into platform operations work.

**What It Does:** Added a Maintenance tab to the Admin panel that turns vendor (FMP) API changelogs into actionable code-review reports. An admin pastes an FMP changelog — typically received by email — into the panel; Claude evaluates it against a maintained registry of every FMP endpoint the platform actually uses (including the specific response fields each piece of code reads) and returns a markdown report flagging any documented change likely to affect NWC code. Findings are tagged by severity — Breaking, Field change, Additive, or Irrelevant — with the exact files involved and a "For Claude Code" checklist a developer can act on directly. Reports download as `.md` and are saved to a history list. Built after two silent FMP endpoint breakages (institutional holders and dilution filings) to shorten the gap between a vendor changing their API and the team catching it.

**Tier Availability:** Internal — Admin only. No public surface; gated behind the existing admin check.

**Marketing Angle:** None — internal operations tooling. Indirect benefit: faster detection of upstream data-vendor changes means fewer user-visible data outages, which supports the platform's reliability positioning.

**Blog/Content Hooks:** None — internal infrastructure. Possible behind-the-scenes/meta angle: "How we keep our market data reliable when our data vendor changes their API."

---

### June 8, 2026

---

#### Volatility Squeeze Detection — Technical Analysis + Stock Screener

**What It Does:** Added detection of the classic "squeeze" setup — when a stock's Bollinger Bands contract inside its Keltner Channels, signaling that volatility is coiling and a breakout (in either direction) often follows. It surfaces in two places. On the **Technical Analysis page**, the Bollinger Bands card shows a status pill: an amber "Squeeze ON · N bars" while a stock is coiling (with the count of consecutive days inside the squeeze), or a teal "Squeeze Fired · Nd ago" when the squeeze has just released. On the **Stock Screener**, two new one-click presets — "In Squeeze" and "Squeeze Fired (3d)" — let users surface every coiling or just-broken-out stock across the ~5,000-name universe, with a matching SQUEEZE / FIRED badge on each result row. The squeeze state for the whole universe is precomputed once daily after market close from a rolling history of daily price bars, so screening stays instant. The signal is deliberately non-directional — it flags that a move is likely, not which way — keeping it honest rather than predictive.

**Tier Availability:** All tiers (Technical Analysis page and Stock Screener)

**Marketing Angle:** The squeeze is one of the most-followed setups among active traders because it answers the question "what's about to move?" before the move happens — but it normally requires manually eyeballing two overlaid indicator bands on chart after chart. Packaging it as a one-click screener preset and an at-a-glance card badge turns a tedious manual scan into an instant, universe-wide opportunity finder. It pairs naturally with the existing Golden Cross and breakout screens as another "moment of opportunity" entry point, and the honest, non-directional framing reinforces the platform's trustworthy-signal positioning.

**Blog/Content Hooks:**
- The Bollinger Band squeeze explained — what it is and why traders watch for it
- "Coiling" vs. "fired" — how to trade a volatility squeeze and confirm the breakout direction
- Why low volatility precedes big moves — the statistics behind the squeeze
- Using the NWC-Analytics squeeze screen to build a daily breakout watchlist

---

#### Technical Analysis — Keltner Channels Card

**What It Does:** Added a Keltner Channels summary card to the Technical Analysis page, showing the upper channel, middle (20-day EMA), lower channel, and the price's position relative to the channels. It sits alongside the Moving Averages and Bollinger Bands cards, which were also repositioned directly beneath the price/volatility chart for a tighter read. Keltner Channels are the second half of the squeeze calculation, so the card gives users the underlying volatility envelope behind the new squeeze badge. Lower-band values that compute below zero on low-priced, high-volatility names are now floored to $0.00 rather than showing a confusing negative price.

**Tier Availability:** All tiers with Technical Analysis access

**Marketing Angle:** Keltner Channels are an ATR-based volatility envelope that many traders use instead of, or alongside, Bollinger Bands. Surfacing them as a first-class card — rather than burying them in an advanced panel — rounds out the platform's volatility toolkit and directly explains the new squeeze signal for users who want to see the math behind it.

**Blog/Content Hooks:**
- Keltner Channels vs. Bollinger Bands — what's the difference and when to use each
- How ATR-based bands adapt to a stock's own volatility
- Reading volatility envelopes — what it means when price rides the upper or lower channel

---

### June 10, 2026

---

#### Breakout & Squeeze Ticker Tape — Landing Page and Nav Header

**What It Does:** Added a second continuously scrolling ticker strip — directly below the existing most-actives tape on the public landing page and embedded in the nav header on every signed-in page — showing live results from two of the platform's own quick-screens: High Volume Breakout and In Squeeze. Each entry carries a color-coded badge (teal "BO" for breakouts, amber "SQZ" for squeezes) alongside its price and percent change. Breakouts lead the tape (up to 8 names showing today's confirmed movers: up 3%+, $50M+ traded, $200M+ market cap) and squeeze candidates fill the remaining slots up to 15 total. Data refreshes every 60 seconds, ETFs and warrants are excluded, and the strip collapses entirely rather than sitting empty on a day with no qualifying names. A July 17 refinement tightened the quality bar: squeeze picks now rank by tightest volatility coil first (rather than biggest company first), require at least 3 consecutive days in squeeze to filter out one-day blips, and multiple share classes of the same company (e.g. GOOG/GOOGL) collapse to a single tape slot so the strip never wastes space on duplicates.

**Tier Availability:** Public on the landing page — no login required; all tiers see it in the nav header across the platform

**Marketing Angle:** The most-actives tape proves the data is live — this tape proves the platform finds *opportunities*. A visitor on the landing page sees actual stocks breaking out and coiling up right now, generated by the same screener they'd get by signing up. It's the product demonstrating itself before the first click. For signed-in users, it turns dead nav-bar space into a persistent "what's moving today" feed that invites a click into the screener from anywhere in the app.

**Blog/Content Hooks:**
- What the BO and SQZ badges in the ticker mean — the screens behind the tape
- High-volume breakouts — why price moves need volume confirmation to be trusted
- From ticker tape to trade idea — a workflow starting from the squeeze strip
- Why we rank squeezes by tightness, not size — small coils, big moves

---

### June 17, 2026

---

#### Options Calculator — Greeks Explained (Clickable Definitions)

**What It Does:** Each Greek on the Options Calculator's Greeks tab — Delta, Gamma, Theta, Vega, and Rho — is now a clickable name that opens a popup explaining the Greek in plain language. The popup separates "What it means" (the one-line definition) from "How it works" (the practical behavior — e.g. that Delta doubles as a rough probability of finishing in-the-money, that Gamma is the acceleration of Delta, or that Theta decay accelerates into expiry). The per-Greek value description shown under each bar was also enlarged and brightened for readability. The popup matches the calculator's theme and adapts to light/dark mode automatically.

**Tier Availability:** Active and Professional

**Marketing Angle:** The Greeks are the single biggest conceptual hurdle for investors new to options — most tools display the numbers but assume the user already understands them. Inline, on-demand definitions turn the Greeks panel into a teaching tool, letting a curious investor learn what each number does without leaving the page or opening a separate guide.

**Blog/Content Hooks:**
- The options Greeks explained — Delta, Gamma, Theta, Vega, and Rho in plain English
- What Delta really tells you — sensitivity, hedge ratio, and probability of profit in one number
- Theta decay — why time is an option buyer's enemy and a seller's friend

---

#### Options Calculator — Live Risk-Free Rate (Tenor-Matched Treasury Yield)

**What It Does:** The Risk-Free Rate field previously defaulted to a hardcoded 5%. It now pulls the live U.S. Treasury yield curve and auto-fills the rate that matches the option's time to expiry — a 30-day option uses the ~1-month bill yield, a 2-year LEAP uses the 2-year yield, and so on. The rate re-matches automatically when the user changes days-to-expiry, and stops auto-managing the moment the user types their own value. The same tenor-matched live rate now also flows through the DCF page's "Trade This — Suggest Options Strategy" modal: its spread estimates and the rate it hands off to the Options Calculator now agree, eliminating a prior inconsistency where the handoff always opened at 5%, and the modal footnote reports the actual rate used. Reuses the existing Treasury-rates feed already powering the Dashboard — no new data source.

**Tier Availability:** Active and Professional (Options Calculator); Trade This handoff on the DCF Valuation page (Casual and above)

**Marketing Angle:** The risk-free rate is a required Black-Scholes input, and a stale hardcoded value quietly undermines the credibility of an "institutional-grade" pricing tool. Auto-matching the live Treasury yield to the option's tenor — the way the rate is actually supposed to be chosen — means the output reflects real market conditions without the user needing to look up the current T-bill rate themselves.

**Blog/Content Hooks:**
- What the risk-free rate is and why it belongs in an options pricing model
- Matching the Treasury yield to your option's expiry — a detail most calculators get wrong
- How interest rates affect options prices — Rho, calls, puts, and LEAPS

---

#### Options Calculator — Smarter Defaults (Realistic Strikes & IV Solver Seed Price)

**What It Does:** Two placeholder values that previously produced confusing or meaningless output were replaced with defaults grounded in the actual inputs. (1) The Strike Price no longer defaults to a fixed $155 — it snaps to a realistic near-the-money strike based on the stock price, using real option-chain increments ($1 under $25, $5 up to $500, $10 above), and updates to match whenever a ticker's live price is fetched. (2) On the IV Solver tab, the Market Option Price now seeds with the Black-Scholes theoretical price computed from the current inputs instead of a fixed $5.00, so the solved implied volatility starts out consistent with the volatility input rather than reflecting an arbitrary placeholder. An accompanying note explains how that value is derived and advises replacing it with the option's actual market price (the bid/ask mid) from the user's trading platform for an accurate read.

**Tier Availability:** Active and Professional

**Marketing Angle:** Hardcoded placeholder values — a strike stuck at $155 regardless of the stock, an option price stuck at $5 — make a calculator look broken and can mislead less-experienced users with nonsense outputs. Defaults derived from the actual stock price and inputs mean the tool shows something sensible the instant it loads, and the IV Solver note steers users to the one input that genuinely has to come from their broker.

**Blog/Content Hooks:**
- How to read an options chain — strikes, expirations, and the bid/ask spread
- Implied volatility explained — what the market's option price is really telling you
- Why "at-the-money" matters — choosing a strike relative to the current price

---

#### Stock Research — ETF Financials 404 Cleanup

**What It Does:** Eliminated a class of browser-console 404 errors that fired when researching ETFs and other fund types. The Stock Research page was requesting company financial statements (to display a P/E ratio) for every ticker, including ETFs — which have no financial statements, so the request always failed. Since a P/E ratio isn't a meaningful metric for a fund anyway, the page now skips that request entirely for fund types, removing the failed network calls without changing anything users see.

**Tier Availability:** All tiers (Stock Research page)

**Marketing Angle:** None directly user-facing — console hygiene and avoiding wasted vendor API calls. Indirect benefit: fewer spurious failed requests keep the platform's diagnostics clean and reduce unnecessary load on the data provider.

**Blog/Content Hooks:** None — bug fix / infrastructure

---

### June 20, 2026

---

#### Relative Valuation Calculator — Peer-Multiple Price-Target Range

**What It Does:** Added a Relative Valuation tab to the DCF Valuation page that estimates a target-price *range* from peer multiples rather than a single intrinsic value. It applies the peer-**median** P/E, P/S, and EV/EBITDA multiples to a company's forward estimates (forward EPS, revenue, EBITDA) to produce three method-based target prices and a MIN–MAX band. The model inputs — forward estimates, net debt, diluted shares, and current price — auto-fill on load, each tagged with a source badge (analyst estimate, actual filing, derived, or live), and a "Source financials" popup exposes the underlying TTM figures with one-click copy so a user never has to leave the page to look something up. Users build a peer set by pulling comparable companies from the fundamental screener (with an optional market-cap band, pre-filled around the target company's own size) or by entering tickers manually, then hand-cut bad comps from a per-peer table that shows each peer's multiples alongside revenue growth, gross margin, and market cap as comparability context — with a flag on growth outliers and median hygiene that excludes negative or extreme (over 100×) P/E values from the median and discloses how many peers actually fed each figure (e.g. "14 of 20"). The output is deliberately a range, never a hero number: P/S is labeled the central estimate for low-earnings names, the P/E method is flagged as unreliable when the trailing multiple is extreme, and a ±10% sensitivity grid on the P/S target shows which assumption the thesis really rides on. A "Cross-check with Relative Valuation" button on the DCF results card hands the ticker straight over, so the intrinsic-value and market-multiple views sit side by side.

**Tier Availability:** Casual and above (matches the DCF Valuation tool)

**Marketing Angle:** A DCF tells you what a company has to do to justify its price; relative valuation tells you what the market is actually paying for comparable businesses right now — and the gap between the two is itself information. Pairing both on one page, forcing the output to be a defensible range, and putting the peer set in the user's hands to curate operationalizes the "calculate your own price target" workflow that retail investors otherwise do by hand in a spreadsheet. The honest framing — a range instead of a single number, comps you can see and cut, a P/E method that flags itself when it's unreliable, and a sensitivity grid for stress-testing — is exactly the trustworthy-signal positioning the platform is built around.

**Blog/Content Hooks:**
- How to calculate your own price target — the three-multiple method (P/E, P/S, EV/EBITDA) explained
- Why a valuation range beats a single number — and how the spread between methods is the real signal
- Choosing comparable companies — how to spot and cut a bad comp before it skews your median
- The EV-to-equity bridge — why subtracting net debt is the step most people get wrong
- DCF vs. relative valuation — how to cross-check intrinsic value against what the market pays

---

#### FMP API Field-Drift Audit — Automated Detection & Weekly Alert

> **Internal tool — not a public or subscriber-facing feature.** Logged here for cross-project visibility into platform operations work.

**What It Does:** Added an automated audit that probes every Financial Modeling Prep `/stable/` endpoint the platform depends on and flags any response field the code expects but the live API no longer returns — the silent class of bug where a data vendor renames or drops a field and our code reads null with no error or warning. It runs three ways: an on-demand CLI script, a weekly scheduled job that emails an alert **only** when it detects drift (and stays silent when everything is clean), and it complements the existing admin changelog-review tool by checking the live API directly rather than waiting for a changelog to be pasted in. Building it immediately surfaced and fixed several latent breakages: the analyst-estimates endpoint had begun requiring a parameter and had renamed its fields (e.g. `estimatedEpsAvg` → `epsAvg`), which had been silently blanking forward EPS / revenue / EBITDA across the DCF and Relative Valuation tools; the company profile's market-cap and exchange fields were being read under stale names (returning null, which also mis-classified company size in the DCF model); and the fundamental screener's exchange field had the same problem. The internal endpoint registry was corrected to match the live field names so it stays a reliable source of truth.

**Tier Availability:** Internal — operations tooling. The underlying field-name fixes benefit all tiers: forward estimates, market cap, and screener exchange data that had quietly stopped populating now work again.

**Marketing Angle:** None directly — internal reliability tooling. Indirect benefit: valuation inputs and forward-looking estimates that had silently broken are restored, and the weekly audit shortens the gap between a data vendor changing their API and the team catching it — reinforcing the platform's data-quality and reliability positioning.

**Blog/Content Hooks:** None — internal infrastructure. Possible behind-the-scenes/meta angle: "How we catch it when our market-data vendor silently changes their API."

---

*Document compiled May 2026. Update this file after each shipped feature and re-attach to all active projects.*
