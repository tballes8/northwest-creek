"""
DCF Valuation API Endpoints - Discounted Cash Flow Analysis
⭐ ENTERPRISE TIER ONLY ⭐
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.db.models import User
from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.services.market_data import market_data_service

router = APIRouter()


def require_paid_tier(current_user: User = Depends(get_current_user)):
    """Require paid tier (Casual, Active, or Unlimited) for Technical Analysis access"""
    allowed_tiers = ["casual", "active", "unlimited"]
    if current_user.subscription_tier not in allowed_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Technical Analysis requires a paid subscription! Current tier: {current_user.subscription_tier.title()}. Upgrade to access this feature!"
        )
    return current_user


@router.get("/calculate/{ticker}")
async def calculate_dcf(
    ticker: str,
    growth_rate: float = Query(0.05, ge=-0.5, le=1.0, description="Expected growth rate (decimal, e.g., 0.05 = 5%)"),
    terminal_growth: float = Query(0.025, ge=0, le=0.10, description="Terminal growth rate (decimal)"),
    discount_rate: float = Query(0.10, ge=0.01, le=0.30, description="Discount rate / WACC (decimal)"),
    projection_years: int = Query(5, ge=3, le=10, description="Years to project"),
    current_user: User = Depends(require_paid_tier),
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 PAID TIERS ONLY - Calculate DCF Valuation for a stock
    
    **Discounted Cash Flow (DCF) Analysis:**
    
    Estimates intrinsic value based on projected future cash flows discounted to present value.
    
    **Parameters:**
    - `ticker` - Stock symbol to analyze
    - `growth_rate` - Expected annual growth rate (default: 5%)
    - `terminal_growth` - Perpetual growth rate after projection period (default: 2.5%)
    - `discount_rate` - WACC / Required rate of return (default: 10%)
    - `projection_years` - Number of years to project (default: 5)
    
    **Returns:**
    - Projected cash flows
    - Discounted present values
    - Terminal value
    - Intrinsic value per share
    - Current price vs intrinsic value comparison
    - Buy/Hold/Sell recommendation
    
    ⭐ **Enterprise Feature:** Unlimited DCF valuations with customizable assumptions!
    """
    try:
        # Get current stock price and company info
        try:
            quote = await market_data_service.get_quote(ticker)
            current_price = float(quote.get('price', 0))
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not fetch current price for {ticker}"
            )
        
        try:
            company = await market_data_service.get_company_info(ticker)
            company_name = company.get("name", ticker)
            market_cap = company.get("market_cap")
        except:
            company_name = ticker
            market_cap = None
        
        # For MVP, we'll use estimated free cash flow based on market cap
        # In production, you'd fetch actual financial statements
        if market_cap:
            # Estimate FCF as 5% of market cap (conservative estimate)
            current_fcf = market_cap * 0.05
        else:
            # Fallback: use a reasonable estimate based on stock price
            current_fcf = current_price * 1000000  # Assume 1M shares outstanding
        
        # Project future cash flows
        projected_cash_flows = []
        for year in range(1, projection_years + 1):
            fcf = current_fcf * ((1 + growth_rate) ** year)
            pv = fcf / ((1 + discount_rate) ** year)
            projected_cash_flows.append({
                "year": year,
                "cash_flow": round(fcf, 2),
                "present_value": round(pv, 2),
                "discount_factor": round(1 / ((1 + discount_rate) ** year), 4)
            })
        
        # Calculate terminal value
        final_year_fcf = projected_cash_flows[-1]["cash_flow"]
        terminal_value = (final_year_fcf * (1 + terminal_growth)) / (discount_rate - terminal_growth)
        terminal_pv = terminal_value / ((1 + discount_rate) ** projection_years)
        
        # Calculate enterprise value
        sum_pv_cash_flows = sum(cf["present_value"] for cf in projected_cash_flows)
        enterprise_value = sum_pv_cash_flows + terminal_pv
        
        # Estimate shares outstanding (in production, fetch from API)
        if market_cap and current_price > 0:
            shares_outstanding = market_cap / current_price
        else:
            shares_outstanding = 1000000  # Fallback estimate
        
        # Calculate intrinsic value per share
        intrinsic_value = enterprise_value / shares_outstanding
        
        # Calculate margin of safety
        margin_of_safety = ((intrinsic_value - current_price) / current_price) * 100
        
        # Determine recommendation
        if margin_of_safety > 20:
            recommendation = "Strong Buy"
            recommendation_color = "green"
            recommendation_message = f"Stock appears undervalued by {abs(margin_of_safety):.1f}%. Consider buying."
        elif margin_of_safety > 10:
            recommendation = "Buy"
            recommendation_color = "green"
            recommendation_message = f"Stock appears undervalued by {abs(margin_of_safety):.1f}%."
        elif margin_of_safety > -10:
            recommendation = "Hold"
            recommendation_color = "yellow"
            recommendation_message = "Stock is fairly valued. Hold current position."
        elif margin_of_safety > -20:
            recommendation = "Sell"
            recommendation_color = "red"
            recommendation_message = f"Stock appears overvalued by {abs(margin_of_safety):.1f}%."
        else:
            recommendation = "Strong Sell"
            recommendation_color = "red"
            recommendation_message = f"Stock appears significantly overvalued by {abs(margin_of_safety):.1f}%."
        
        return {
            "ticker": ticker,
            "company_name": company_name,
            "current_price": round(current_price, 2),
            "assumptions": {
                "growth_rate": growth_rate,
                "terminal_growth": terminal_growth,
                "discount_rate": discount_rate,
                "projection_years": projection_years,
                "current_fcf": round(current_fcf, 2),
                "shares_outstanding": round(shares_outstanding, 0)
            },
            "projections": projected_cash_flows,
            "terminal_value": {
                "value": round(terminal_value, 2),
                "present_value": round(terminal_pv, 2),
                "growth_rate": terminal_growth
            },
            "valuation": {
                "sum_pv_cash_flows": round(sum_pv_cash_flows, 2),
                "terminal_pv": round(terminal_pv, 2),
                "enterprise_value": round(enterprise_value, 2),
                "intrinsic_value_per_share": round(intrinsic_value, 2),
                "current_price": round(current_price, 2),
                "margin_of_safety": round(margin_of_safety, 2)
            },
            "recommendation": {
                "rating": recommendation,
                "color": recommendation_color,
                "message": recommendation_message
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"DCF calculation error for {ticker}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not calculate DCF for {ticker}: {str(e)}"
        )