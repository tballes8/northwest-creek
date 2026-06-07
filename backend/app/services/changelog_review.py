"""
Vendor changelog review — sends a pasted FMP changelog to Claude along with the
NWC FMP endpoint registry, and returns a markdown assessment an admin can hand to
Claude Code. No auto-fetch: FMP's changelog page 403s bots, and the owner pastes
the changelog (received by email) into the Admin panel.
"""
import httpx

from app.config import get_settings
from app.services.fmp_endpoint_registry import render_registry_for_prompt

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-6"

_SYSTEM_PROMPT = """You are a senior backend engineer reviewing a third-party API \
vendor's changelog for impact on an existing codebase ("NWC-Analytics"). The vendor \
is Financial Modeling Prep (FMP). You are given (1) a registry of every FMP endpoint \
NWC currently uses — its path, the NWC files that call it, and the response fields \
NWC reads — and (2) the text of an FMP changelog the user pasted in.

Your job: decide which changelog items, if any, affect NWC's code, and produce an \
actionable markdown report for a developer using Claude Code to fix things.

Rules:
- Only flag changes that touch an endpoint or a field present in the registry. \
Anything about endpoints/fields NWC does not use is "Irrelevant".
- Be precise and conservative. Do not invent endpoints or fields. If a changelog \
item is ambiguous, say so and mark it for manual verification rather than guessing.
- Severity scale: **Breaking** (path removed/renamed, field NWC reads removed/renamed, \
response shape change), **Field change** (field added/semantics changed that NWC may \
want), **Additive** (new endpoint/field NWC could adopt), **Irrelevant**.

Output format (markdown only, no preamble):

# FMP Changelog Review — <today or "undated">

## Summary
One or two sentences: how many relevant items, highest severity.

## Findings
A markdown table with columns: Severity | Changelog item | FMP endpoint | Affected NWC files | Recommended action.
If there are no relevant items, write "No changes affect NWC's current FMP usage." and skip the table.

## For Claude Code
A concrete, ordered checklist of things to verify or change in the NWC codebase, \
referencing the specific files from the registry. Each item should be something a \
developer can act on directly (e.g. "Verify `stocks.py` get_ownership still receives \
`ownership` field from institutional-ownership endpoint; FMP renamed it to X")."""


async def assess_changelog(changelog_text: str) -> str:
    """Run Claude over the pasted changelog + endpoint registry; return markdown."""
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        return "AI review is not configured (ANTHROPIC_API_KEY missing)."

    registry = render_registry_for_prompt()
    prompt = (
        "Here is the registry of FMP endpoints NWC uses:\n\n"
        f"{registry}\n\n"
        "------\n\n"
        "Here is the FMP changelog text the user pasted:\n\n"
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
                "model": MODEL,
                "max_tokens": 2000,
                "system": _SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]
