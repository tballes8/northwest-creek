"""
Portfolio AI analysis service — builds a focused prompt from portfolio data
and calls the Anthropic Claude API to generate a plain-language summary.
"""
import httpx
from typing import List, Dict, Any
from app.config import get_settings


async def analyze_portfolio(
    positions: List[Dict[str, Any]],
    portfolio_totals: Dict[str, Any],
    market_context: Dict[str, Any],
) -> str:
    """
    Generate a plain-language AI summary of the user's portfolio.

    positions: list of dicts with ticker, quantity, buy_price, current_price,
               total_value, profit_loss, profit_loss_percent
    portfolio_totals: dict with total_value, total_profit_loss, total_profit_loss_percent
    market_context: dict with index data (name, changePercent)
    """
    settings = get_settings()

    if not settings.ANTHROPIC_API_KEY:
        return "AI analysis is not configured. Please contact support."

    total_value = portfolio_totals.get("total_value", 0)
    total_pl = portfolio_totals.get("total_profit_loss", 0)
    total_pl_pct = portfolio_totals.get("total_profit_loss_percent", 0)

    # Sort by absolute profit_loss to surface biggest movers
    sorted_positions = sorted(
        positions,
        key=lambda p: abs(p.get("profit_loss") or 0),
        reverse=True,
    )

    # Tag each position with its contribution to total P&L
    def contribution_str(pos: Dict[str, Any]) -> str:
        pl = pos.get("profit_loss") or 0
        pl_pct = pos.get("profit_loss_percent") or 0
        contrib_pct = (pl / total_pl * 100) if total_pl and total_pl != 0 else 0
        sign = "+" if pl >= 0 else ""
        return (
            f"{pos['ticker']}: {sign}${pl:,.2f} ({sign}{pl_pct:.1f}%), "
            f"contributing {abs(contrib_pct):.0f}% of total {'gain' if pl >= 0 else 'loss'}"
        )

    gainers = [p for p in sorted_positions if (p.get("profit_loss") or 0) >= 0][:3]
    losers = [p for p in sorted_positions if (p.get("profit_loss") or 0) < 0][:3]

    gainer_lines = "\n".join(f"  - {contribution_str(p)}" for p in gainers) or "  - None"
    loser_lines = "\n".join(f"  - {contribution_str(p)}" for p in losers) or "  - None"

    # Market index context
    index_lines = ""
    for idx in market_context.get("indexes", []):
        change_pct = idx.get("changePercent")
        if change_pct is not None:
            sign = "+" if change_pct >= 0 else ""
            index_lines += f"  - {idx['name']}: {sign}{change_pct:.2f}%\n"

    # Income / dividend section
    income_positions = sorted(
        [p for p in positions if p.get("dividend_yield")],
        key=lambda x: x.get("dividend_yield") or 0,
        reverse=True,
    )
    total_annual_income = sum(p.get("annual_income") or 0 for p in positions)

    if income_positions:
        income_lines = "\n".join(
            f"  - {p['ticker']}: {p['dividend_yield']:.2f}% yield, "
            f"~${p['annual_income']:,.2f}/yr estimated income"
            for p in income_positions
        )
        income_section = (
            f"Income profile:\n"
            f"  - Estimated total annual portfolio income: ~${total_annual_income:,.2f}\n"
            f"{income_lines}"
        )
    else:
        income_section = "Income profile:\n  - No dividend-paying positions detected"

    prompt = f"""Portfolio snapshot:
- Total value: ${total_value:,.2f}
- Total P&L: {"+" if total_pl >= 0 else ""}${total_pl:,.2f} ({"+" if total_pl_pct >= 0 else ""}{total_pl_pct:.2f}%)
- Positions held: {len(positions)}

Top gainers:
{gainer_lines}

Top losers:
{loser_lines}

{income_section}

Broad market performance today:
{index_lines.strip() if index_lines.strip() else "  - Market data unavailable"}

Write a 3-5 sentence plain-language summary explaining what is happening in this portfolio and why. If the portfolio has meaningful dividend income, mention it."""

    system_prompt = (
        "You are a portfolio analysis assistant. Explain portfolio performance in plain, "
        "clear language. Identify which positions are driving gains or losses and how the "
        "portfolio compares to broad market performance. When dividend income is present, "
        "note the income-generating character of those holdings. Never give financial advice, "
        "investment recommendations, buy or sell signals, or price predictions. "
        "Keep your response to 3-5 sentences."
    )

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
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 500,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]
    except Exception:
        return (
            "Unable to generate AI analysis at this time. "
            "Please try again in a moment."
        )
