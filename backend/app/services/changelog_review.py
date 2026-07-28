"""
Vendor changelog review — sends a pasted vendor changelog to Claude along with a
dependency registry for that vendor (when we have one), and returns a markdown
assessment an admin can hand to Claude Code.

Two paths:
- GROUNDED: the vendor has a registry in `vendor_registries.py` (FMP, Stripe,
  Anthropic, Twilio, SendGrid). Claude maps changelog items to the exact NWC code
  that would break, using the registry as source of truth.
- GENERIC: any other vendor (e.g. Railway, Cloudflare). No field-level registry,
  so Claude does a best-effort impact review grounded only in NWC's stack profile,
  and the report is clearly labeled lower-confidence.

No auto-fetch: many changelog pages 403 bots, so the owner pastes the changelog
(usually received by email) into the Admin panel.
"""
import httpx

from app.config import get_settings
from app.services.vendor_registries import (
    NWC_STACK_PROFILE,
    get_registry_text,
    normalize_vendor,
)

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def _grounded_system_prompt(vendor_display: str) -> str:
    return f"""You are a senior backend engineer reviewing a third-party vendor's \
changelog for impact on an existing codebase ("NWC-Analytics"). The vendor is \
{vendor_display}. You are given (1) a registry of exactly how NWC depends on this \
vendor — the SDK/API surface, the objects, fields, and events our code reads, and \
the NWC files that use them — and (2) the text of a changelog the user pasted in.

Your job: decide which changelog items, if any, affect NWC's code, and produce an \
actionable markdown report for a developer using Claude Code to fix things.

Rules:
- Only flag changes that touch something present in the registry (an endpoint, SDK \
method, object/field, webhook event, model ID, or config NWC uses). Anything about \
parts of the vendor NWC does not use is "Irrelevant".
- Be precise and conservative. Do not invent dependencies. If a changelog item is \
ambiguous, say so and mark it for manual verification rather than guessing.
- Severity scale: **Breaking** (something NWC uses is removed/renamed/changed shape, \
a model NWC pins is deprecated, an auth/signature change), **Field change** (field or \
behavior NWC reads changed in a way that may matter), **Additive** (new capability NWC \
could adopt), **Irrelevant**.

Output format (markdown only, no preamble):

# {vendor_display} Changelog Review — <changelog date or "undated">

## Summary
One or two sentences: how many relevant items, highest severity.

## Findings
A markdown table with columns: Severity | Changelog item | What it touches | Affected NWC files | Recommended action.
If there are no relevant items, write "No changes affect NWC's current {vendor_display} usage." and skip the table.

## For Claude Code
A concrete, ordered checklist of things to verify or change in the NWC codebase, \
referencing the specific files from the registry. Each item should be something a \
developer can act on directly."""


def _generic_system_prompt(vendor_display: str) -> str:
    return f"""You are a senior engineer reviewing a third-party vendor's changelog \
for impact on an existing system ("NWC-Analytics"). The vendor is {vendor_display}. \
NWC has NO field-level dependency registry for this vendor, so this is a best-effort \
review: you are given (1) a profile of NWC's stack and (2) the pasted changelog text.

NWC stack profile:
{NWC_STACK_PROFILE}

Your job: decide which changelog items could plausibly affect NWC — most likely \
operationally (deploys, build images, runtime versions, cron, SSH/CLI access, \
networking, pricing/quota, security) rather than via a response-field rename — and \
produce an actionable markdown report.

Rules:
- Without a registry you cannot point to exact code. Reason from the stack profile \
about whether NWC plausibly uses the affected surface. If NWC almost certainly does \
not use it (e.g. a product/feature absent from the profile), mark it "Irrelevant".
- Be conservative and explicit about uncertainty. Prefer "verify manually" over a \
confident claim. Do NOT invent NWC files or dependencies.
- Severity scale: **Action needed** (deploy/runtime/security/billing change NWC must \
react to), **Heads-up** (could matter, verify), **Additive** (new capability), \
**Irrelevant**.

Severity discipline — absence of evidence is NOT a reason to escalate:
- The stack profile's "Known NEGATIVE facts" section is authoritative. If an item \
only touches something listed there as unused, it is **Irrelevant**. Do not \
re-open it as "Heads-up" on the theory that the setting might have been enabled \
outside the codebase.
- **Heads-up requires a positive hook**: name the specific thing from the stack \
profile the item touches. If you cannot name one, the item is Irrelevant or \
Additive — not Heads-up. "NWC might be using this" is not a hook.
- For an OPT-IN vendor feature (something that must be deliberately turned on), the \
default assumption is that NWC has not turned it on unless the profile says \
otherwise. Rate it Irrelevant or Additive. If it would genuinely matter should NWC \
adopt it later, add that as a one-line conditional note in the Recommended action \
column — do not inflate the severity to carry the note.
- Do not rate the same item twice or hedge across two severities. Pick one.

Output format (markdown only, no preamble):

# {vendor_display} Changelog Review — <changelog date or "undated">

> Best-effort review: NWC has no dependency registry for {vendor_display}, so findings \
are based on the stack profile and should be manually verified.

## Summary
One or two sentences: how many items could matter, highest severity.

## Findings
A markdown table with columns: Severity | Changelog item | Why it might affect NWC | Recommended action.
If nothing is relevant, write "No items appear to affect NWC." and skip the table.

## For Claude Code / Ops
A concrete, ordered checklist covering ONLY the items you rated **Action needed** or \
**Heads-up**. Do not write checklist steps for Irrelevant or Additive items — an \
item you ruled out in the table must not reappear here as a verification task. If no \
item is Action needed or Heads-up, write exactly "No action required." and nothing \
else in this section.
Every step must be something whose outcome could actually change NWC's code or \
config. Do not pad the list with dashboard tours, status checks of features the \
profile says are unused, or "confirm X is still fine" steps. Prefer 1-3 real steps \
over a long speculative list. Mark any step that needs the live environment or a \
dashboard (rather than the repo) with "[manual]"."""


async def assess_changelog(changelog_text: str, vendor: str | None = None) -> str:
    """Run Claude over the pasted changelog. If `vendor` is one we have a registry
    for, do a grounded review; otherwise do a best-effort generic review."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        return "AI review is not configured (ANTHROPIC_API_KEY missing)."

    grounded_key = normalize_vendor(vendor)
    vendor_display = grounded_key or (vendor.strip() if vendor else "Unknown vendor")

    if grounded_key:
        system_prompt = _grounded_system_prompt(vendor_display)
        registry = get_registry_text(grounded_key)
        prompt = (
            f"Here is the registry of how NWC depends on {vendor_display}:\n\n"
            f"{registry}\n\n"
            "------\n\n"
            f"Here is the {vendor_display} changelog text the user pasted:\n\n"
            f"{changelog_text.strip()}\n\n"
            "------\n\n"
            "Produce the markdown report per your instructions."
        )
    else:
        system_prompt = _generic_system_prompt(vendor_display)
        prompt = (
            f"Here is the {vendor_display} changelog text the user pasted:\n\n"
            f"{changelog_text.strip()}\n\n"
            "------\n\n"
            "Produce the markdown report per your instructions."
        )

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.ANTHROPIC_MODEL,
                "max_tokens": 2000,
                "system": system_prompt,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]
