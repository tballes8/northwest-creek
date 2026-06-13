"""
Vendor dependency registries for the Admin changelog reviewer.

Each *grounded* vendor has a registry describing exactly how NWC depends on it —
the SDK/API surface, the objects/fields/events our code reads, and the files that
use them — so Claude can map a changelog item to the specific code that would
break. FMP's (large) registry lives in `fmp_endpoint_registry.py`; the rest live
here. Vendors without a registry (e.g. Railway, Cloudflare) get a best-effort
"generic" review grounded only in the stack profile below.

KEEP THESE IN SYNC when integration code changes — a stale registry silently
makes the reviewer miss real breakages.
"""
from typing import Callable, Optional

from app.services.fmp_endpoint_registry import render_registry_for_prompt as _render_fmp


# ── NWC stack profile — context for the GENERIC (no-registry) review path ────
# Used when an admin pastes a changelog for a vendor we have no registry for.
# It lets Claude judge "does this plausibly affect NWC?" without a field map.
NWC_STACK_PROFILE = """\
NWC-Analytics is a stock-analytics SaaS. Architecture:
- Backend: Python FastAPI (async), SQLAlchemy + asyncpg, deployed on Railway
  (web service + scheduled cron jobs). Postgres and Redis run as Railway services.
- Frontend: React 19 + TypeScript, built and served as a static site.
- Container/build: Docker + docker-compose for local dev.
- Third-party APIs NWC calls from code: Financial Modeling Prep (market data),
  Stripe (billing), Anthropic (AI), Twilio (SMS), SendGrid (email).
- Hosting/infra dependencies: Railway (deploy, runtime, cron, managed Postgres/
  Redis, CLI used for ops), plus DNS/CDN at the edge.

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
- Response read: `content[0].text` (assumes first content block is text)

Pinned model IDs in use (a model retirement/deprecation directly breaks these):
- `claude-sonnet-4-6` — `services/stock_analyzer.py` (price target + analysis), `services/cycle_phase_analyzer.py`, `services/changelog_review.py` (this reviewer)
- `claude-sonnet-4-20250514` — `services/portfolio_analyzer.py`  ⚠ OLDER pinned model; highest deprecation risk

Files: `services/stock_analyzer.py`, `services/cycle_phase_analyzer.py`, `services/portfolio_analyzer.py`, `services/changelog_review.py`.

Watch items: model deprecation/retirement dates (especially the older pinned model),
`anthropic-version` date requirements, changes to the Messages request params or to the
`content` block response shape, and any max_tokens / rate-limit changes.
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

SENDGRID_REGISTRY = """\
SDK: `sendgrid` Python SDK — `SendGridAPIClient(SENDGRID_API_KEY)` and the mail
helpers `from sendgrid.helpers.mail import Mail, Email, To, Content, HtmlContent`.
- Construct `Mail(from_email=Email(addr, name), to_emails=, subject=, html_content=...)`
- Send via `sg.send(message)` (expects a 2xx; v3 `mail/send` under the hood)

Files:
- `services/email_service.py` — verification, password-reset, payment-success emails (multiple from-addresses: default/support/sales)
- `services/alert_checker.py` — price-alert email
- `services/technical_alert_checker.py` — technical-alert email
Config: SENDGRID_API_KEY.

Watch items: changes to the `Mail`/`Email`/`Content` helper constructors or the
`mail/send` payload, sender-identity / domain-authentication requirements that could
block delivery, and `send()` response/exception behavior."""


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
    "SendGrid": {
        "display": "SendGrid",
        "summary": "email — verification, password reset, alerts.",
        "registry": SENDGRID_REGISTRY,
        "aliases": ["twilio sendgrid"],
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
