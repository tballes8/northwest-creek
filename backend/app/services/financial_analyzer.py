"""
AI financials read — sends a pre-computed fact block to Claude and returns a
short plain-language judgement on the company's financial health.

Deliberately narrow: this is not a valuation call, not a recommendation, and not
a restatement of the ratio cards the user can already see. See the system prompt
below for the enforced constraints.

Follows the existing convention in this app of calling the Messages API directly
over httpx (see `anthropic_response.extract_text` for why). Migrating all four
call sites to the official SDK is worth doing, but as its own change.
"""
import logging
import httpx
from typing import Optional

from app.config import get_settings
from app.services.anthropic_response import extract_text

logger = logging.getLogger(__name__)

# The model returns exactly this when the fact block holds nothing worth saying.
# Distinct from a None return, which means the call failed.
NOTHING_NOTABLE = "NOTHING_NOTABLE"

# ~3-5 sentences is roughly 180 tokens. 700 costs nothing extra on a normal
# response and removes any chance of truncating a verbose one mid-sentence.
MAX_TOKENS = 700

SYSTEM_PROMPT = """You are a financial statement analyst writing for a retail investor who can read a
balance sheet but cannot spot a trend across twelve quarters. You are given a
pre-computed fact block. Every figure in it is already calculated. You do no
arithmetic.

Rules, in priority order:

1. Use ONLY figures present in the fact block. Never compute, infer, or estimate a
   number that is not there. If a fact is marked "unavailable", do not mention it or
   its absence.

2. Cite at most two absolute dollar figures. Prefer direction and magnitude of change
   over levels — the reader can already see every level in a table below your summary.
   Repeating the table is a failure.

3. Lead with a judgment about financial health. Not a list of ratios: what the ratios
   mean taken together.

4. Name at least one specific concern or one specific notable trend, identifying the
   metric and the direction. "Investors should monitor margins" is a failure.
   "Operating margin has fallen for three consecutive quarters while gross margin
   held" is the standard.

5. Judge the company against its own history in the fact block. You have no sector
   averages and no peer data — never imply a comparison to either.

6. Never give buy, sell, or hold advice. Never state or imply a price target, a fair
   value, or whether the shares are cheap or expensive. Valuation is a separate
   feature and is not your job.

7. Negative earnings are a fact, not a verdict. If the company is loss-making,
   discuss the trajectory — widening or narrowing, cash burn against cash on hand —
   and do not remark that a P/E ratio is meaningless.

8. If nothing in the fact block is genuinely notable — no meaningful trend, no
   concern, nothing a reader would not see at a glance — reply with exactly the
   single token NOTHING_NOTABLE and nothing else.

9. 3 to 5 sentences. Plain language. No bullet points, no headings, no markdown, no
   preamble."""


async def analyze_financials(ticker: str, fact_block: str) -> Optional[str]:
    """Return the summary text, the NOTHING_NOTABLE sentinel, or None on failure.

    None means "could not generate" — the caller should suppress the card without
    caching and without charging the user's quota.
    """
    settings = get_settings()

    if not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not configured; skipping financials read for %s", ticker)
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": settings.ANTHROPIC_MODEL,
                    "max_tokens": MAX_TOKENS,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": fact_block}],
                },
            )
            response.raise_for_status()
            data = response.json()

            # A truncated summary is a broken sentence, not a short one — treat it
            # as a failure rather than rendering half a thought.
            if data.get("stop_reason") == "max_tokens":
                logger.warning(
                    "Financials read for %s hit max_tokens (%d); discarding",
                    ticker, MAX_TOKENS,
                )
                return None

            text = extract_text(data).strip()

            if text.strip(" .\"'*") == NOTHING_NOTABLE:
                return NOTHING_NOTABLE

            return text or None

    except ValueError:
        # extract_text raises this when the response carries no text block, which
        # is what a `stop_reason: "refusal"` looks like (HTTP 200, empty content).
        logger.exception("Financials read for %s returned no text block", ticker)
        return None
    except Exception:
        logger.exception(
            "Financials read request failed for %s (model=%s)",
            ticker, settings.ANTHROPIC_MODEL,
        )
        return None
