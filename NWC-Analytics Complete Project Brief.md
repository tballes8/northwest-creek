# NWC-Analytics: Complete Project Brief

Nov 7, 2026 · @Tyrone Ballesteros

## Purpose of this document

This is the single reference brief for NWC-Analytics, consolidated from the four Claude Team projects (NWC Sandbox, NWC Enhancements, NWC Marketing, NWC Blogs / SM Post / Videos) and general chats before the Team account suspension. Attach it to a project in the personal Claude account so any new conversation starts with full context on the product, stack, principles, roadmap, and marketing playbook.

This brief does not replace the files that lived in the Team projects. Export these separately before access ends: NWC-Analytics-Feature-Log.md (source of truth for every feature claim), YouTube\_VideoList.xlsx, the HTML blog library, all Claude Code briefs (identity-gate-brief.md, TASK\_public-screener-demo.md and others), and each project's custom instructions. Anthropic publishes no guarantee that Team projects will be restored on resubscription.

Where project notes contradict each other, the conflict is listed in Open items at the end rather than silently resolved.

**Checked against the code (Nov 7, 2026).** The project notes were written without access to the repository. Claude Code compared this brief with the code and corrected what the code contradicts: the stack, feature and roadmap statuses, plans and prices, and the Open items the code can settle. Facts that only the code shows are in three added sections: **Plans and limits**, **Rules the code enforces** and **Relaunch switches and status**. An ID such as C16 or N42 refers to `docs/SITE_REVIEW.md` in the repo, the findings tracker from the Oct 30 site review.

## Company and founder

NWC-Analytics is a one-person SaaS business run by Tyrone Ballesteros, a veteran based in Post Falls, Idaho. He is sole owner, developer, marketer, and content creator.

| Item | Detail |
| --- | --- |
| Product | NWC-Analytics, nwc-analytics.com |
| Operating entity | NWC-Analytics, LLC, founded 2026 (EIN on file) |
| Other entity | Northwest Creek, LLC, Idaho, est. 2017, dormant but in good standing |
| Retired brand | northwestcreekllc.com (pre-launch site; remove all mentions) |
| Contact | support@nwc-analytics.com, sales@nwc-analytics.com (Google Workspace aliases) |
| Separate venture (exploring) | NWC Investment Group: member-managed Idaho LLC investment club with friends, Fidelity brokerage; must stay fully separate from NWC-Analytics, LLC |
| Business support | Montana/Idaho VBOC and Idaho SBDC as first contacts; SBA Veterans Advantage fee waiver applies; engage a CPA once profitable for S-Corp election timing and multi-entity planning |

**Founder background relevant to the product.** Has done his own taxes since 2007. Reads primary SEC filings directly. Strong domain knowledge in financial data pipelines, corporate actions, and market mechanics. Actively trades his own portfolio on shorter time horizons using the platform.

## Product

NWC-Analytics is an opinionated, all-in-one stock research platform that makes institutional-grade analysis approachable for retail investors, with DCF valuation as the hero feature. Target user: someone on a simple or banking-first broker who wants better research without a complex pro platform. It deliberately does not compete with charting platforms like TradingView.

### Positioning

- **Taglines in use:** "Professional Analytic Tools for the Retail Investor" (also seen as "Professional Analysis Tools..."), "Professional tools at individual prices" (homepage), "Wall Street's research tools. Built for the rest of us." (content). Pick one for relaunch.
- **White space:** no major broker offers a native intrinsic-value (DCF) calculator. Reviewer language widely supports the "big-broker tools are too complicated" critique.
- **Core philosophy:** retail users credit or blame the platform for outcomes, not themselves, so the platform owns the outcome. Data quality and suppression logic are credibility infrastructure.
- **Pricing:** four monthly plans: Beginner $10, Casual Investor $20, Active Investor $40, Professional $50. Beginner and Casual start with a 14-day free trial (card required); Active and Professional have none. Limits are under Plans and limits below.

### Core differentiators

1. Three DCF models (FMP Simple, FMP Levered, and NWC's own sector-aware model), with value in showing where they disagree. NWC's model is rule-based, not AI.
2. Sector-aware DCF assumptions suggested from the company's own data. These are rule-based: no AI call is made, although the DCF page's button says "Get AI Suggestions" (C16, open). Don't market them as AI until that changes.
3. Plain-language explanations of technical analysis and fundamentals.
4. Warrant, ETF, bankruptcy, and negative-FCF detection with suppression of misleading outputs.
5. Technical alerts and trading signals (labeled Bullish/Bearish, not BUY/SELL).
6. Product insight from founder trading data: the gap between information delivery and behavioral guardrails at order entry is a genuine differentiator most retail platforms ignore.

### Features (verify against the Feature Log before publishing any claim)

Updated from the code on Nov 7, 2026.

| Area | What exists |
| --- | --- |
| Stock Research | NWC AI target price with a bear–bull range, generated on click and cached 6 hours; AI financial statement analysis (cached card + Refresh); analyst consensus target, shown only for US-dollar reporters and within 4x of the price |
| Valuation | DCF calculator with a reverse DCF readout (implied growth). Its pre-fill comes from FMP's reported financials, not from SEC filings directly, although the page labels it "From SEC filings" (C20, open). FMP's own simple and levered DCFs appear as benchmarks under the same dollar/4x rule. Relative valuation: peer P/E, P/S and EV/EBITDA applied to forward estimates, giving a min–max target range |
| Technical analysis | 15+ indicators; synced vertical reference line across charts; A/D Line; AI TA summary; "Squeeze ON" badge; ATR stop calculator (chandelier exit; fixed stop, R-multiples and share count from your entry price); Fibonacci retracement/expansion on the intraday chart |
| Screener | Stocks listed on a US exchange (ADRs included) plus ETFs; 17 presets, including "Volatility Squeeze" (renamed from "In Squeeze" on Oct 31 so presets describe conditions, not outcomes) and "Squeeze Fired (3d)"; saved screens on Active and Professional |
| Options | Active and Professional only. Black-Scholes and binomial pricing, Greeks, spreads with payoff chart, IV Solver, dividend yield. Pricing math errors fixed Nov 4–6 (N37–N41). The volatility it fetches is 30-day realized, not implied: there is no options-chain data (see Massive.com) |
| Portfolio & tracking | Portfolio tracker on a transaction ledger; AI Portfolio Analysis; watchlist (batch technical screens on Active and Professional); dashboard; price alerts and eight technical alert types (sentiment shift, MA crossover, RSI extreme, MACD cross, Bollinger breach, Parabolic SAR flip, DCF valuation, Rule of 40), delivered by email only |
| Market views | Market movers, sector heat map, sector rotation, IPO calendar (exchange transfers and relistings filtered out using SEC filing history), ETF & Fund Analytics Panel, two ticker tapes (most active; breakouts and squeezes); experimental price projection cone (may be removed) |
| Data safeguards | Bankruptcy banners (8-K Item 1.03, hides valuation estimates); dividend recency gates; yield sanity caps; cross-exchange ticker collision guard; company identity checked against SEC's CIK; P/E cross-check; everything shown in US dollars; warrants, units, rights, preferreds and notes kept out of lists. See Rules the code enforces |

### Plans and limits

From `backend/app/core/tier_limits.py`, which a test keeps identical to the site's pricing data. Beginner and Casual limits reset weekly; Active and Professional daily.

| | Beginner | Casual | Active | Professional |
| --- | --- | --- | --- | --- |
| Price per month | $10 | $20 | $40 | $50 |
| Free trial | 14 days | 14 days | none | none |
| Watchlist / portfolio entries | 10 / 10 | 20 / 20 | 45 / 45 | 75 / 75 |
| Alerts in total (price + technical) | 5 | 10 | 20 | 50 |
| ...of which technical alerts | 0 | 0 | 5 | 20 |
| Saved screens | 0 | 0 | 15 | 50 |
| DCF valuations | 5/week | 15/week | 20/day | 40/day |
| Relative valuations | 0 | 15/week | 20/day | 40/day |
| Technical analyses | 5/week | 15/week | 10/day | 20/day |
| AI analyses | 0 | 5/week | 10/day | 25/day |
| Watchlist screens | 0 | 0 | 5/day | 15/day |
| Options calculator | no | no | yes | yes |

The pricing card and landing page present price and technical alerts as separate allowances ("50 price alerts" and "20 technical alerts" read as 70); in the code the technical alerts come out of the total (C34, open).

## Current status and relaunch plan

NWC-Analytics is on hold: production shuts down at the end of the billing cycle on Nov 14, 2026, with zero paying subscribers and only an early-access list. The Team Claude account was suspended in Oct 2026; the paid personal account continues.

**Why it paused.** Tyrone's diagnosis is that traffic was the gap, not product or pricing. The relaunch will be funded by savings and driven by paid advertising.

**Shutdown checklist (in progress by Nov 14):**

- [ ] Cancel recurring services: Railway, Postmark, monitoring, FMP, Massive/Polygon (check notice periods and auto-renew terms)
- [ ] Email the early-access list directly
- [ ] Delete or deliberately retain collected user data per the privacy policy
- [ ] Keep nwc-analytics.com; replace the app with an "on hold" page plus email capture
- [ ] Archive repo, environment configs, database schema, Feature Log, and Claude Code briefs somewhere independent of canceled services
- [ ] Write a short restart note: where work stopped and why
- [ ] Export all Team project content before access ends
- [ ] Switch Claude Code in VS Code to the personal account; unset any ANTHROPIC\_API\_KEY env var to avoid API billing

**Relaunch approach agreed in planning:**

1. Have analytics and conversion tracking (visit → signup → paid) working before spending anything.
2. Run a small, single-channel test with a slice of the budget. First paid traffic will reveal whether visitors convert.
3. Scale only if the conversion rate makes customer acquisition cost work against the $10–50/month price. Otherwise fix product or pricing before spending more.
4. Work out max affordable cost per click from price × conversion rate; that number sets the savings target.

Intended paid channels: Google Search Ads and Reddit Ads. NewsBreak rejected. YouTube cold prospecting deferred until messaging is validated and a remarketing audience exists. Expect high CPCs in finance/investing and extra ad-platform review for financial products.

### Relaunch switches and status (from the code, Nov 7, 2026)

The pause was done with switches rather than by deleting code, so relaunch is one change each:

| Switch | Now | At relaunch | Where |
| --- | --- | --- | --- |
| `NEW_SIGNUPS_OPEN` | false: every public sign-up button and link is hidden; /register still works by direct URL | true | `frontend/src/data/pricingTiers.ts` |
| `FMP_BATCH_ENDPOINTS` | false since the FMP plan downgrade on Oct 31 (the plan has no batch endpoints) | true, on the backend **and** the daily-snapshot cron, after upgrading FMP | Railway variables |
| `INTRADAY_BAR_MINUTES` | 5 (the downgraded plan refuses 1-minute bars) | 1; the landing page advertises 1-minute bars | `backend/app/api/v1/endpoints/intraday.py` |
| Landing demo card | a labelled sample scaled to AAPL at $342 | rescale it if AAPL has moved far from that | `frontend/src/components/landing/HeroDemoCard.tsx` |

While `FMP_BATCH_ENDPOINTS` is off, the screener and the daily snapshot stay frozen at their last data, the breakouts-and-squeezes tape is hidden, extended-hours quotes are empty, and live prices refresh every 60 seconds instead of every 20.

**Site review (`docs/SITE_REVIEW.md`):** 15 of 16 launch blockers are fixed. Still open:

- **FMP commercial license (the remaining blocker).** FMP's individual plans are for personal use. A paid app needs a commercial plan plus a Data Display license. Settle it before relaunch, including whether a public demo is allowed.
- **Conversion tracking (before any ad spend).** GA4 records page views only. There are no custom events, no ad pixels (Reddit Pixel, Google Ads, Microsoft UET) and no server-side trial→paid conversion from the Stripe webhook, which is needed because that conversion happens 14 days after the visit. The Privacy Policy must be updated before any pixel goes in, and pixels must never load on a URL carrying a password-reset or email-verify token.
- **One high finding, S7.** Password hashing runs on the main server loop, so a burst of logins stalls the API, and AI endpoints have no burst limit.
- **Medium and low findings.** They wait on Tyrone's review of the tracker before any work starts.

**Index data:** the S&P 500 and the Dow can't be shown. No FMP plan licenses them (S&P Dow Jones Indices licensing), and they were removed from the app on Oct 30.

## Enhancements and roadmap (NWC Enhancements project)

The Enhancements project was for strategy, scoping, and writing ready-to-use Claude Code briefs, not writing code. Features are judged by how much existing infrastructure they reuse and rolled out in phases gated on usage.

### Product principles

- **Opinionated output.** Features that hand complexity back to users (custom charts, build-your-own graph) are rejected.
- **No summary-of-summaries.** A "complete analysis" feature was rejected: no added value, invites buy/sell pressure, hallucination risk.
- **Three DCF models are enough.** The value is in their disagreement, not a fourth model.
- **Anthropic API is the AI layer.** Custom training, fine-tuning, and local AI on cheap hardware rejected; use tighter per-surface prompts and structured tool use.
- **Detection-and-suppression is intentional** (warrants, ETFs, bankruptcy, negative FCF, edge cases).
- **AI content** uses cached cards with timestamps and an on-demand Refresh button.
- **Deliberate, minimal changes.** Scope before code; monitor deployments before making more changes.

### Roadmap status

| Item | Status | Notes |
| --- | --- | --- |
| Reverse DCF panel | Shipped | Implied growth as a three-point band (discount rate −1%, as set, +1%), with suppression; the held blog post can go ahead |
| Bankruptcy detection | Shipped | SEC EDGAR 8-K Item 1.03 filed within the last 550 days; hides valuation estimates on the stock page |
| Parabolic SAR flip alerts | Shipped | `sar_flip` alert type: bullish, bearish or any flip, with a minimum prior-trend-bars filter (default 5) |
| TTM Squeeze | Phases 1–2 shipped | Phase 1 screener presets → Phase 2 badge (the "Squeeze ON" badge on the TA page) → full card → alert. No squeeze alert yet |
| Single-signal forward-return backtester | Decided to build | Not started in the code. Trigger count, full return distribution (not averages), disclosure that past results aren't predictive |
| Options Calculator fix | Done Nov 4–6 | Pricing math, dividend yield, spreads and labels fixed (N37–N41). Live implied volatility still needs options-chain data (see Massive.com) |
| Landing page redesign | Partly shipped | Live ticker tape is the highest-ROI dynamic element. Two tapes and an animated sample card are live. Nov 7: the tape shows $5+ names with no leveraged or inverse funds (C36); the breakouts-and-squeezes tape is hidden while paused and skips SPAC shells (N42); the sample card is labelled and shows an AI target range instead of a DCF point value (C35) |
| Per-route SEO metadata | Next SEO task | Titles, descriptions, canonicals, Article schema; OG tags pending SSR/prerender decision |
| Cost basis to 4 decimals | Mostly done | Low effort, high value for fractional/DRIP accuracy. Already stored and entered to 4 decimals (shares to 8); only the holdings table still displays 2 |
| Signal Divergence card | Proposed | Shown only when technicals and fundamentals disagree |
| News interpretation card | Proposed | — |
| Ops system | Designed | Not in the code yet. /api/v1/ops router, ops\_events table, APScheduler, digest email; priority: social monitoring → analytics digest → support triage → subscriber lifecycle |
| Options contract data (Massive.com) | Exploring | Greeks, IV, open interest, OHLCV; placement and audience unresolved |
| DCF false-precision fix | Deferred | Replace outputs like "undervalued by 23.4%" with honest ranges. The DCF page still shows one intrinsic value with an Undervalued / Fair Value / Overvalued label, and the landing page still lists "Clear Buy / Hold / Overvalued recommendation" |
| Price projection cone | Experimental | In the code, may be removed: a Monte Carlo cone (5th to 95th percentile, one year out) on the stock page, loaded on click |
| Dividend reader v2 | Deferred | Duration-aware quarterly filtering, multi-concept XBRL merge |
| Fund distribution / return-of-capital pipeline | Deferred | Scoped |
| Indicator description audit | TODO | Trading Signals scoring-weight philosophy parked |
| "What if I bought X shares" column | Parked | — |
| Trade execution | Parked | Gated on first subscriber |
| Open-weight model swap | Later | One-line config change once infrastructure is proven |
| Mobile app | Speculative | Don't pursue unless Tyrone reopens it |

### Claude Code brief standard

Every brief covers architecture, behavior, fail-soft requirements, analytics events, an explicit out-of-scope list, acceptance criteria, and open decisions. Use searchable string landmarks instead of line numbers, include verification gates, and specify exact code changes. Diagnose first: explain root cause and findings, get approval, then write code. Open philosophy questions are named and parked.

## Engineering, stack, and data pipeline (NWC Sandbox project)

The Sandbox project held the technical architecture and data-quality work. At shutdown the backend and frontend were live and stable on Railway with healthy metrics.

### Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS, built with Create React App (react-scripts 5), not Vite. Charts: Chart.js for daily price and indicator charts, Recharts for the intraday chart, DCF and sector heat map. A small Node server (`server.js`) serves the build, blog preview pages for social cards, redirects for retired paths and the sitemap (Railway service `modest-caring`) |
| Backend | Python, FastAPI (async), SQLAlchemy with asyncpg, PostgreSQL, Alembic migrations (run at startup), in-process APScheduler jobs, plus Railway crons for the daily snapshot and technical alerts (Railway service `divine-laughter`) |
| Edge | Cloudflare DNS/CDN/SSL (Full Strict), Page Rules, Response Header Transform Rules, Crawler Hints/IndexNow |
| Market data | FMP primary (plan downgraded Oct 31, see Relaunch switches); SEC EDGAR for company identity, bankruptcy filings and IPO screening, through one throttled client; FRED for macro and Treasury rates. No Polygon or Massive.com code exists |
| AI | Anthropic Claude API (production key from Console, separate from Claude.ai billing), model `claude-sonnet-4-6`, set by the `ANTHROPIC_MODEL` variable; Claude Code in VS Code for development |
| Email | Postmark only, domain-verified sending from nwc-analytics.com, through one send function. SendGrid is gone (its name survives only in a commented-out landing-page line) |
| Payments | Stripe only: card form, subscriptions, Customer Portal for card updates. No PayPal code exists |
| Live prices | WebSocket to the browser; the server polls FMP every 20 seconds (60 while the plan lacks batch quotes). Not a streaming feed |
| OG images | Dynamic /og/:slug.png (1200×630) for blog posts via satori + resvg-js, PT Serif/Lora fonts, seeded sparkline backgrounds; other pages use the static og-default.png |
| Analytics & SEO | GSC, GA4 (page views only), Bing Webmaster Tools, Cloudflare Web Analytics; React 19 native metadata (not react-helmet-async); Microsoft Clarity installed, with Strict text masking and disclosure in the Privacy Policy. No ad pixels |

### Data principles

- **Suppress, don't caveat.** Unreliable data or an unverified entity means the output is suppressed. A bankruptcy banner replaces valuation; it does not sit beside it as a disclaimer.
- **Ticker is a mutable label; CIK is identity.** Entity modules gate on CIK.
- **FMP is a claim, EDGAR is the record** for identity and historical GAAP actuals. Known FMP failure modes: ex/pay-date sequencing, frequency tags, distribution tax character.
- **Honest ranges over false precision** for DCF, backtester, and price targets.
- **Fail soft.** Use `Promise.allSettled` for optional sources so thinly traded securities don't break the full page load.

### Rules the code enforces (Nov 7, 2026)

These are built in. A proposal that contradicts one should say so explicitly.

- **The paywall is on the server.** Every protected page and API call needs an active or trialing Stripe subscription. Stripe is the authority: the stored status is re-read from Stripe on every webhook and every 6 hours, so late or duplicate events are harmless. Admin and demo accounts are exempt. The frontend only routes people to billing; it is not the paywall.
- **AI runs only on a click, never on page load.** A cached result is free; a new one counts against the plan's AI allowance. That is why the landing page shows a labelled sample, not a live AI summary.
- **Everything is shown in US dollars.** Foreign filers' statements and estimates are converted at today's rate before anything is derived from them (Toyota reports in yen, TSM in Taiwan dollars). No rate means a blank, never an unconverted number.
- **Identity is the CIK, not the ticker.** Every company page checks the ticker against SEC's records and gets one of four verdicts:
  - **Match:** shown normally.
  - **Cannot resolve** (funds, brand-new listings): never blocks.
  - **Successor registrant** (a reorganization that minted a new CIK, as with FREYR Battery → T1 Energy): a banner, not a block.
  - **Contradiction** (the vendor's data belongs to a different company than the ticker): suppresses every company-specific figure at the source.
- **P/E must pass a cross-check.** FMP's P/E has to agree within 2x with market cap divided by trailing earnings, or P/E, P/B and EV/EBITDA are withheld everywhere: screener, company page, DCF and relative valuation. Multiples below floors (P/E 1, P/B 0.1, EV/EBITDA 1) are dropped too. FMP gets some badly wrong: Sabesp at a P/E of 2 against a true 15, Biogen at 1.7.
- **A failed fetch is never shown as "none".** If a data source fails, the page says the data is unavailable. It never shows "no dividends" or an empty list. On Oct 25 a throttling burst had rewritten 2,186 dividend payers as non-payers that way.
- **The screener universe is "listed on a US exchange", not "US-domiciled".** That brings in TSM, ASML, Accenture and Linde. One shared filter keeps warrants, SPAC units and rights, preferreds and notes out of every list.
- **Alerts are one-shot and email-only.** An alert is marked fired only after the email is delivered. If delivery fails, it stays armed and retries.
- **Indicators are computed in-house,** one implementation shared by the TA page, screens, AI reads and alerts, so they can't disagree.

### Pipeline work completed or specified

- Cross-exchange ticker collision guard implemented.
- Company-name cross-check guard recommended in backend `stocks.py` to filter FMP news by confirmed identity.
- `identity-gate-brief.md`: CIK-based upstream identity check gating all downstream modules, suppress-not-caveat, mandatory Task 0 diagnosis. Implemented, with a fourth verdict for successor registrants and a fund exception (see Rules the code enforces).
- Dividend recency gates, yield sanity caps, and bankruptcy banners built.
- Special distributions (e.g., VISN return of capital): reclassify frequency, remove annualized yield, correct ex-dates; exclude distributions ≥25% of share price from yield. Nasdaq Rule 11140(b)(2) puts ex-date after pay date for distributions over 25% of price, so it needs an explicit exclusion rule.
- SEO fixes: dynamic sitemap (previously only five URLs indexed; 38 confirmed in Search Console), robots.txt cleaned, /register and /registerwithpayment noindexed, slug redirects via SLUG\_REDIRECTS in server.js, two cannibalized URL pairs resolved with 301s.

### Known issues at shutdown

- Cloudflare showed a 5xx error rate not visible in Railway metrics; never investigated.
- Cloudflare AI crawler blocking was hurting discoverability; recommended setting to allow.
- og-default.png is near-square (997×962, confirmed Nov 7); should be 1200×630. It is the social card for every page except blog posts, which get generated 1200×630 cards.
- FMP marks Texas Stock Exchange movers as not actively trading, so they silently leave the screener (seen with OBK).

### Monitoring and tooling

- Anthropic changes (re-fetch and diff, no RSS): platform.claude.com release notes and the model deprecations page, to avoid failures from retired model snapshots. The backend calls `claude-sonnet-4-6`; check that model on the deprecations page before relaunch and change the `ANTHROPIC_MODEL` variable if needed.
- Cloudflare feeds: Application Performance, DNS, SSL/TLS, Cache/CDN, Cloudflare Status RSS.
- openpyxl recalc pattern: build workbook → run recalc.py → read back data\_only values to verify.
- PDF extraction: `pdftotext -layout` + grep for section headers + `sed -n` for ranges.
- Research standard: primary SEC filings (10-K, 10-Q, 8-K, S-1, S-3, 424B5, Form 1-A); aggregator ratings and algorithmic outputs are not evidence.

## Marketing strategy (NWC Marketing project)

The marketing goal is subscriber acquisition from zero by letting the product demonstrate its value, not by hype. Tyrone handles all marketing himself and has ruled out email marketing as a growth channel (no marketing list as of Oct 2026).

### Channels

| Channel | Handle | Role |
| --- | --- | --- |
| Blog | nwc-analytics.com/blogs | Primary compounding SEO asset |
| YouTube | @NWC-Analytics | Discovery via search |
| Reddit | u/tballes8; owns r/InvestorResearch | Discovery; r/investingforbeginners is the primary acquisition sub |
| Substack | tballesteros.substack.com | Retention, not discovery |
| Instagram | — | Secondary |
| Discord | Not built | Consider claiming the brand handle only; revisit once subscriber base is large |

Unlocked subs via karma building: r/investing, r/stocks, r/ValueInvesting. Also active in r/pennystocks and r/AIFU\_stock. A takeover of r/InvestmentEducation was pursued via r/redditrequest. One breakout Reddit post passed 150K views.

### Brand

- Colors: charcoal/teal, the live site's palette, is the standard (decided Nov 7, 2026). Teal #0d9488 is the accent (#2dd4bf on dark backgrounds), on charcoal #111827 / #1f2937 in dark mode and white in light mode. The navy #1a2a3a / blue #2c7be5 / cream #f9f6f1 palette from earlier notes is not used on the site; the blog HTML design system below still has a navy header.
- Type: Georgia/PT Serif headings, Arial/Inter UI labels. Georgia excluded from OG images for licensing. On the site itself, all text uses the system sans-serif (Inter is not loaded). The only script type is the logo wordmark: Viner Hand ITC, which ships with Microsoft Office, with Caveat as the fallback most visitors actually see. The app's nav links moved from script to sans on Nov 7; the blog nav's tagline is still script.
- Video: dark mode standard.
- Never name competitors in content (legal risk, implied endorsement).
- Brand consistency for a future social media hire: the existing marketing instructions already act as a portable style guide. Don't build anything more until a hire happens.

### Marketing assets

- 30–40 second homepage intro video script covering the screener, plain-language explanations, DCF models, and technical alerts, ending on a "See it in action" CTA.
- Early access landing page with email capture, promoted to r/stocks and r/ValueInvesting.
- Freemium screener task doc (TASK\_public-screener-demo.md): public gated screener, once-daily static snapshot, localStorage gating at 3 free runs, auto-run default preset. Open decisions: placement, free-run count, universe cap, counter reset.

### Learnings

- Search intent is the top traffic driver. YouTube search traffic gets 2x the CTR of browse/suggested.
- GSC is authoritative for search. GA4 is the source of truth for attribution. Cloudflare analytics skews toward self-traffic.
- A \~6-month domain sitting at position 40+ with high impressions and near-zero clicks is normal, not a reason to change strategy.
- Judge YouTube titles on search impressions after 3+ weeks, not daily views.
- Blog posts with embedded video are text pages to Google. Video SEO needs dedicated video pages with VideoObject data.
- A consistent content footprint is how AI search tools and future models learn about the platform.

## Content operation (NWC Blogs / SM Post / Videos project)

Content exists to build organic search traffic and community awareness through educational investing material, then convert that audience to subscribers. Education comes first; platform mentions are earned in context.

### Production pipeline per topic

1. Blog post (HTML)
2. r/investingforbeginners post: no links, no platform mentions, self-reply strategy
3. r/InvestorResearch post: longer, links and platform mentions allowed
4. Substack post: distinct, deeper angle, never a republication
5. YouTube script, if applicable (produced as a twin of the blog with cross-links)

### Voice

- Short punchy sentences, conversational first person, strong declarative titles. Builder-authentic, not salesy. Must sound like Tyrone, not Claude.
- Reddit: American prose, no bullet points, tight, end on a quotable closing line, no forced engagement questions.
- Best-performing hook: counterintuitive framing ("Why a stock drops after good earnings", "Priced in before the news").
- Timely event plus concept beats evergreen-only on Reddit.
- Keep "the market is overdue" framing out; the correction-vs-crash post corrects that misconception.

### Rules

- **Feature Log is the source of truth.** Verify every platform feature mention against NWC-Analytics-Feature-Log.md before publishing.
- **One feature spotlight block per blog post,** scoped to the most relevant feature.
- **Pull, don't push.** In comment threads, introduce NWC-Analytics only when someone asks a relevant follow-up.
- External links go in a self-reply "further reading" comment; body links get ranking penalties.
- One exchange max with hostile commenters, then disengage.
- Best Reddit window: Tue–Thu, 7–9am ET.
- YouTube gives no directional trade signals and avoids signals-service framing. The squeeze video states twice that the squeeze is non-directional.
- Blogs use evergreen ranges; Reddit may use live figures for timely hooks. Flag hard numbers for verification.
- News pegs go in clearly marked sections so the evergreen body stays timeless.
- Reddit posts for different subs must differ from each other.
- Blog posts can be written ahead of features and updated with platform links once shipped.
- YouTube embeds are added to blog posts only during natural edit passes.

### Blog pre-write workflow

1. Verify live slugs: `grep -roh "nwc-analytics.com/blogs/[a-z0-9-]*" *.html | sort | uniq`. Filenames don't reliably match live slugs; flag unconfirmed links with HTML comments.
2. Pull the CSS component library and SEO head block from a recent reference post (e.g., etf-expense-ratios-explained.html).
3. Verify feature claims in the Feature Log with `grep -niE` and context lines.
4. Match a video from YouTube\_VideoList.xlsx (supersedes the old .txt list).
5. Write the post.

HTML design system: dark navy gradient header, blue-bordered h2s, callout/warning boxes, data tables, feature spotlight block, crosslink cards, CTA box, disclaimer, footer.

**Collaboration pattern.** Tyrone rewrites drafts himself and brings back trimmed versions for a final accuracy check rather than asking for iterative rewrites. Claude should actively catch duplicate content, inaccurate platform claims, and directional framing.

### Library and series

| Asset | Status |
| --- | --- |
| Blog library | Large: indicators (momentum, volume, volatility, trend), ETF expense ratios, P/E, DCF/reverse DCF, price targets, investment styles, sector rotation, yield curve, CPI/PPI, GDP, market cap, 60/40, dividends vs bonds, corporate bonds, buybacks, correction vs crash, bankruptcy, tax topics, SPACs, AI investing layers, picks and shovels, blockchain settlement, commodities, seasonality, futures, exchanges |
| YouTube indicator series | Momentum complete; Volume, Volatility, Trend scripts produced; squeeze breakout (BB + Keltner) and Bollinger Bands explainer produced |
| YouTube tutorials | Descriptions written for DCF, Dashboard, Watchlist, Portfolio, Alerts, Stocks, Technical Analysis; nine titles retitled question-shaped and keyword-forward |
| Options series | 10 parts, Reddit + Substack |
| Futures series | 10 parts, Reddit + Substack |

### Content queue

| Item | Status / prerequisite |
| --- | --- |
| 7-strategy video+blog twin series | Next; built on questions people search before knowing an indicator's name (highest leverage) |
| Trump Accounts post | Confirm feature spotlight, verify two crosslink slugs, set refresh cadence (perishable) |
| Data center / AI power series | 4 posts, pillar-and-spoke: hub → equipment → generation → regulated utilities map; start with hub |
| Investing styles pillar | Value/reverse DCF drafted; Growth, Quality, Low Volatility, Revenue, Core remain |
| Reverse DCF post | Held until feature ships |
| Exercising-options post | Update to nwc-analytics.com / support@ before publishing |
| Texas Stock Exchange content | Wait for Q4 2026 listings news hook |
| r/options expansion | Activate via options calculator content |

**Video tools:** VSDC (recording), NaturalReader (AI voiceover), Clipchamp (editing), After Effects + Premiere Pro (motion graphics).

## Founder trading validation and how to work with Tyrone

Tyrone's eTrade account is a live validation environment for NWC-Analytics signals. An in-depth review of closed swing trades across two brokerage accounts found a high win rate but a negative reward-to-risk ratio.

**Behavioral patterns identified:** revenge trading, holding losers too long, concentration risk, and time-based rather than thesis-based exits. Example: the Fibonacci tool set SHLS entry and invalidation levels (daily 61.8% as the stop), and a follow-on TOST idea was flagged mid-conversation as revenge trading.

**Product implication:** platforms deliver information but put no behavioral guardrails at order entry. That gap is a real differentiator for NWC-Analytics and the strongest candidate for a relaunch angle.

### Working preferences for any Claude session

- Be direct. No hedging, no softening, no automatic praise.
- Critically assess every feature idea against the core differentiators (analysis tools, plain-language explanations, DCF models, technical alerts). Call out anything commoditized, focus-diluting, or feature creep. This is a single-employee operation; low-value work costs real time.
- Ground feedback in Tyrone's actual data, not hypotheticals or "if" scenarios.
- Diagnose before implementing. Scope first, minimal changes, monitor after deploys.
- Chat sessions handle strategy, scoping, design, and briefs. Claude Code handles implementation.
- Tyrone knows his costs; don't lecture on them.
- Skills fit procedural "how to do X" workflows; persistent brand and identity context belongs in project instructions.

## Open items and conflicts to resolve

The project notes disagree in several places; settle each before the relaunch so new sessions don't repeat stale facts.

| Topic | Conflict | Likely answer |
| --- | --- | --- |
| Subscribers | Blog project says "active subscriber base" | Zero paying subscribers; early-access list only |
| Payments | Stripe (Marketing, Blog) vs PayPal Checkout recurring billing (Enhancements) | **Resolved from the code:** Stripe only; no PayPal code exists |
| Email | SendGrid (Blog) vs Postmark (Sandbox, Marketing) | **Resolved from the code:** Postmark only |
| Charts | Recharts (Blog) vs Chart.js (Enhancements) | **Resolved from the code:** both. Chart.js for daily price and indicator charts; Recharts for the intraday chart, DCF and sector heat map |
| Other services | Twilio, WebSocket, SubscriptionGuard listed only in Blog project | **Resolved from the code:** Twilio and SMS were removed Oct 30, 2026. The WebSocket carries live prices. SubscriptionGuard still exists but only routes people to billing; the server enforces the paywall |
| Tagline | Three versions in use | Pick one for relaunch. On the site now: "Professional Stock Analysis for Retail Investors" (page titles, social cards, footers, blog nav), "Wall Street's research tools. Built for the rest of us." (landing headline), "Professional tools at individual prices." (landing subhead). "Professional Analytic Tools for the Retail Investor" is not on the site |
| Brand palette | Navy/blue/cream vs the live site's charcoal/teal | **Resolved Nov 7, 2026:** charcoal/teal is the standard (see Brand) |

**Still open:**

- [ ] Cloudflare 5xx errors not seen in Railway: never investigated
- [ ] Cloudflare AI crawler setting: switch to allow
- [ ] Options contract data via Massive.com: placement and target audience undecided
- [ ] Freemium screener: placement, free-run count, universe cap, counter reset
- [ ] OG tags: SSR/prerendering decision
- [ ] Trading Signals scoring philosophy: mechanical-and-transparent vs smart-and-smoothed
- [ ] Ask Anthropic Support in writing whether Team project data is retained after suspension
