"""Shared parsing helper for raw Anthropic Messages API responses.

NWC calls the Messages API directly over httpx (no SDK), so every caller has to
pull the assistant's text out of the response `content` array itself. Indexing
`content[0]` is unsafe: on models where thinking is on by default (Sonnet 5,
Opus 5 and later) the first block is a `thinking` block with no `text` key, so
`content[0]["text"]` raises KeyError. Since `ANTHROPIC_MODEL` is overridable via
env var, that break can arrive with no code change at all.

Scan for the text block instead of assuming its position.
"""

from typing import Any


def extract_text(data: dict[str, Any]) -> str:
    """Return the first text block from a Messages API response body.

    Raises ValueError when the response carries no text block — e.g. a refusal
    (`stop_reason: "refusal"`), which returns HTTP 200 with empty content.
    """
    for block in data.get("content") or []:
        if block.get("type") == "text":
            return block["text"]

    raise ValueError(
        f"Anthropic response contained no text block "
        f"(stop_reason={data.get('stop_reason')!r})"
    )
