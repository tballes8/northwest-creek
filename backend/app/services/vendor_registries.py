"""
Vendor dependency registries for the Admin changelog reviewer.

Each *grounded* vendor has a registry describing exactly how NWC depends on it —
the SDK/API surface, the objects/fields/events our code reads, and the files that
use them — so Claude can map a changelog item to the specific code that would
break. FMP's (large) registry lives in `fmp_endpoint_registry.py`; the rest live
here. Vendors without a registry (e.g. Railway, Cloudflare) get a best-effort
"generic" review grounded only in the stack profile below.

KEEP THESE IN SYNC when integration code changes — a stale registry silently
makes the reviewer miss real breakages. The same applies to the "Known NEGATIVE
facts" list in NWC_STACK_PROFILE: the generic review path treats it as
authoritative and downgrades items to "Irrelevant" on the strength of it, so if we
ever adopt CI, a Railway CDN, feature flags, or multi-region replicas, remove that
line from the list or the reviewer will wave through a change that does affect us.
"""
from typing import Callable, Optional

from app.services.fmp_endpoint_registry import render_registry_for_prompt as _render_fmp


# ── NWC stack profile — context for the GENERIC (no-registry) review path ────
# Used when an admin pastes a changelog for a vendor we have no registry for.
# It lets Claude judge "does this plausibly affect NWC?" without a field map.
NWC_STACK_PROFILE = """\
NWC-Analytics is a stock-analytics SaaS. Architecture:
- Backend: Python FastAPI (async), SQLAlchemy + asyncpg, deployed on Railway
  (web service + scheduled cron jobs) at api.nwc-analytics.com. Postgres and Redis
  run as Railway services. The API sets no Cache-Control headers on any response.
- Frontend: React 19 + TypeScript (CRA build). NOT Railway static hosting — it runs
  a custom Node http server (`frontend/server.js`, started by `npm run serve`) that
  wraps `serve-handler` to add server-side Open Graph injection for /blogs/:slug.
  It sets its own cache headers: HTML `public, max-age=0, must-revalidate`,
  OG images `public, max-age=86400`.
- Edge: nwc-analytics.com sits behind **Cloudflare**. Cloudflare is the CDN/DNS
  layer; no other CDN is enabled in front of either service.
- Container/build: Docker + docker-compose for local dev only.
- Third-party APIs NWC calls from code: Financial Modeling Prep (market data),
  Stripe (billing), Anthropic (AI), Twilio (SMS), Postmark (email).
- Hosting/infra dependencies: Railway (deploy, runtime, cron, managed Postgres/
  Redis) + Cloudflare at the edge.

Known NEGATIVE facts — things NWC does NOT use. Treat these as authoritative;
a changelog item that only touches one of them is "Irrelevant", not "Heads-up":
- No CI/CD pipeline of any kind. There is no `.github/workflows` directory, no
  Jenkins/CircleCI/GitLab config, no Makefile. Deploys are Railway-native, driven by
  the build/deploy blocks in `frontend/railway.json` and the backend service config.
- Railway CLI is essentially unused in the codebase. The only reference anywhere is
  a `railway run` example inside a docstring in
  `backend/app/tasks/backfill_sector_rotation.py`. In particular NWC does not use
  `railway config pull` / `railway config push`, `railway cdn`, or `railway flag`.
- No Railway CDN. No Railway feature flags. No infrastructure-as-code and no
  version-controlled Railway config beyond `frontend/railway.json` and
  `backend/railway-cron.toml`.
- No multi-region or replica configuration. Cron jobs are declared in
  `backend/railway-cron.toml` as plain name/schedule/command entries with no region
  or replica fields, so there is no region map to mis-round-trip.
- No Grok/xAI, no OpenAI, no Gemini, no LangChain. Anthropic is the only LLM vendor.

When reviewing an infrastructure/platform vendor (hosting, CDN, CI, CLI, runtime),
the risk is usually operational — deploys, build images, runtime versions, cron
behavior, SSH/CLI access, networking, pricing/quota — NOT a response-field rename."""


# ─────────────────────────────────────────────────────────────────────────────
#  Grounded registries (one text block per vendor, same spirit as the FMP one)
# ─────────────────────────────────────────────────────────────────────────────

STRIPE_REGISTRY = """\
SDK: `stripe` Python SDK, pinned `stripe==11.2.0` (backend); Stripe.js Elements on
the frontend (`frontend/src/pages/Payment.tsx`). API version is whatever this SDK
pins / the account default — watch for API-version-gated shape changes.

Server-side calls NWC makes (all in `api/v1/endpoints/stripe_payments.py`):
- `stripe.Customer.list(email=, limit=)`, `stripe.Customer.create(email=, metadata=)` — reads `customer.id`
- `stripe.Subscription.list(customer=, status=, ...)` — filters by status `active` and `trialing`
- `stripe.Subscription.create(customer=, items=[{'price': price_id}], metadata=, payment_behavior=, expand=['latest_invoice.payment_intent'], trial_period_days=...)`
- `stripe.Subscription.modify(sub_id, items=[{id, price}], proration_behavior=, metadata=, cancel_at_period_end=)`
- `stripe.Subscription.retrieve(sub_id)`
- `stripe.checkout.Session.create(...)` — reads `.url`, `.id`
- `stripe.Webhook.construct_event(payload, sig_header, secret)`
- Error types caught: `stripe.error.StripeError`, `stripe.error.SignatureVerificationError`

Subscription object fields NWC reads:
- `items.data[0].price.id` (maps price → tier)
- `metadata.user_id` (links sub back to our User)
- `status` (expects `active`, `trialing`)
- `cancel_at_period_end`, `current_period_end`
- `latest_invoice.payment_intent.client_secret` and `.status`
  (expects `requires_payment_method`, `requires_confirmation`, `requires_action`)
- `pending_setup_intent` (and its `client_secret`)

Invoice fields read: `invoice.subscription` (used to retrieve the Subscription), `invoice.id`.
NOTE: `invoice.subscription` has changed across recent Stripe API versions — flag any
changelog item touching invoice→subscription linkage or the `latest_invoice.payment_intent`
expand, as both are load-bearing here.

Checkout Session fields read: `metadata.user_id`, `subscription`, `url`, `id`.

Webhook event types NWC handles (anything else is logged + ignored):
- `checkout.session.completed`  → upgrade tier, set is_active
- `invoice.paid`                → AUTHORITATIVE tier update (must not break)
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `customer.subscription.trial_will_end`

Config: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_{BEGINNER,CASUAL,ACTIVE,PROFESSIONAL}_PRICE_ID."""

ANTHROPIC_REGISTRY = """\
NWC calls the Anthropic Messages API directly over HTTP (no SDK), via httpx.
- Endpoint: `POST https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- Request body fields used: `model`, `max_tokens`, `system` (some callers), `messages: [{role, content}]`
- Response read: via `services/anthropic_response.extract_text()`, which scans the
  `content` array for the first `type == "text"` block rather than indexing
  `content[0]`. Models with thinking on by default (Sonnet 5 / Opus 5 and later)
  lead with a `thinking` block that has no `text` key, so positional indexing
  breaks on a model bump. Raises ValueError when there is no text block at all
  (e.g. `stop_reason: "refusal"`, which returns HTTP 200 with empty content).

Pinned model ID (a model retirement/deprecation directly breaks all AI services):
- `config.ANTHROPIC_MODEL` (default `claude-sonnet-4-6`, overridable via the ANTHROPIC_MODEL
  env var) — single source of truth read by `services/stock_analyzer.py` (price target +
  analysis), `services/cycle_phase_analyzer.py`, `services/changelog_review.py` (this reviewer),
  and `services/portfolio_analyzer.py`. Bump it in one place when migrating Sonnet versions.

Files: `services/stock_analyzer.py`, `services/cycle_phase_analyzer.py`, `services/portfolio_analyzer.py`, `services/changelog_review.py`, `services/anthropic_response.py`.

Watch items: model deprecation/retirement dates (especially the older pinned model),
`anthropic-version` date requirements, changes to the Messages request params or to the
`content` block response shape, and any max_tokens / rate-limit changes. Note that a
model bump also changes request-parameter validity — newer models reject `temperature`
/ `top_p` / `top_k` and the old `thinking.budget_tokens` shape. NWC sends none of those
today, so the bump itself is currently just the ANTHROPIC_MODEL value.
Config: ANTHROPIC_API_KEY."""

TWILIO_REGISTRY = """\
SDK: `twilio` Python SDK (`from twilio.rest import Client`), lazy-loaded.
- Auth: `Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)`
- Only call NWC makes: `client.messages.create(body=, from_=TWILIO_FROM_NUMBER, to=<E.164>)`
- `from_` is a single E.164 number (`TWILIO_FROM_NUMBER`), not a messaging service SID.

Files: `services/sms_service.py` — used for (1) phone-verification OTP codes and
(2) price/technical alert SMS notifications.
Config: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.

Watch items: changes to `messages.create` params or `Client` auth, A2P 10DLC /
regulatory registration requirements that could block sends from an unregistered
number, and sender-number / messaging-service policy changes."""

POSTMARK_REGISTRY = """\
API: Postmark REST (no SDK) — `requests.post` to `https://api.postmarkapp.com/email`
with header `X-Postmark-Server-Token` (the *Server* token, not the Account token).
- JSON body: `{From, To, Subject, HtmlBody, MessageStream}`
- `From` is formatted as `"Display Name <addr>"`
- Success is HTTP 200 AND `ErrorCode == 0`; any other combination is a failure.
  Notable ErrorCodes: 406 recipient suppressed (prior bounce/spam complaint),
  400/401 sender signature not confirmed, 429 rate limited.

Files:
- `services/email_service.py` — THE single outbound send path. All email flows
  through `EmailService.send_email()`: verification, password-reset, payment,
  price-alert, and technical-alert (multiple from-addresses: default/support/sales).
  `services/alert_checker.py` and `services/technical_alert_checker.py` call into
  it via `asyncio.to_thread` rather than constructing their own client.
Config: POSTMARK_SERVER_TOKEN, POSTMARK_MESSAGE_STREAM.

Watch items: changes to the `/email` payload keys or ErrorCode semantics, message
stream requirements (transactional mail must stay off broadcast streams), sender
signature / domain-authentication rules that could block delivery, and changes to
Postmark's automatic suppression behavior on bounce."""


# ─────────────────────────────────────────────────────────────────────────────
#  Vendor table — key → spec. `registry` is text or a callable returning text.
#  Order here is the order shown in the Admin picker.
# ─────────────────────────────────────────────────────────────────────────────
VendorRegistry = str | Callable[[], str]

VENDORS: dict[str, dict] = {
    "FMP": {
        "display": "FMP (Financial Modeling Prep)",
        "summary": "market data — the screener, quotes, financials, DCF, news.",
        "registry": _render_fmp,
        "aliases": ["financial modeling prep", "financialmodelingprep", "massive"],
    },
    "Stripe": {
        "display": "Stripe",
        "summary": "billing — subscriptions, checkout, webhooks.",
        "registry": STRIPE_REGISTRY,
        "aliases": [],
    },
    "Anthropic": {
        "display": "Anthropic",
        "summary": "AI — price targets, company/portfolio/cycle analysis.",
        "registry": ANTHROPIC_REGISTRY,
        "aliases": ["claude"],
    },
    "Twilio": {
        "display": "Twilio",
        "summary": "SMS — OTP verification and alert texts.",
        "registry": TWILIO_REGISTRY,
        "aliases": [],
    },
    "Postmark": {
        "display": "Postmark",
        "summary": "email — verification, password reset, alerts.",
        "registry": POSTMARK_REGISTRY,
        "aliases": ["postmarkapp", "activecampaign postmark"],
    },
}


def normalize_vendor(vendor: Optional[str]) -> Optional[str]:
    """Map a free-form vendor string to a canonical grounded key, or None if we
    have no registry for it (→ generic review)."""
    if not vendor:
        return None
    v = vendor.strip().lower()
    for key, spec in VENDORS.items():
        if v == key.lower() or v in spec.get("aliases", []):
            return key
    return None


def get_registry_text(vendor_key: str) -> str:
    """Render the registry block for a grounded vendor key."""
    reg = VENDORS[vendor_key]["registry"]
    return reg() if callable(reg) else reg


def grounded_vendor_keys() -> list[str]:
    return list(VENDORS.keys())
