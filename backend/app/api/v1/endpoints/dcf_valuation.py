"""
DCF Valuation API Endpoints - Discounted Cash Flow Analysis
⭐ PAID TIERS ONLY 
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
    """Require paid tier (Casual, Active, or Professsional) for Technical Analysis access"""
    allowed_tiers = ["casual", "active", "professional"]
    if current_user.subscription_tier not in allowed_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"DCF Valuation requires a paid subscription! Current tier: {current_user.subscription_tier.title()}. Upgrade to access this feature!"
        )
    return current_user


@router.get("/suggestions/{ticker}")
async def get_dcf_suggestions(
    ticker: str,
    current_user: User = Depends(require_paid_tier),
    db: AsyncSession = Depends(get_db)
):
    """
    🔒 PAID TIERS ONLY - Get AI-suggested DCF parameters for a stock
    
    Returns intelligent default parameters based on:
    - Company sector and industry
    - Market capitalization
    - Growth characteristics
    
    **Returns:**
    - Suggested growth rate, terminal growth, discount rate, and projection years
    - Reasoning for each parameter
    - Company information
    """
    try:
        # Get company info and quote
        try:
            company = await market_data_service.get_company_info(ticker)
            quote = await market_data_service.get_quote(ticker)
            
            company_name = company.get("name", ticker)
            sector = company.get("sector", "Unknown")
            industry = company.get("industry", "Unknown")
            market_cap = company.get("market_cap", 0)
            current_price = float(quote.get('price', 0))
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not fetch company information for {ticker}: {str(e)}"
            )
        
        # Determine company size category
        if market_cap >= 200_000_000_000:  # $200B+
            size_category = "mega_cap"
        elif market_cap >= 10_000_000_000:  # $10B+
            size_category = "large_cap"
        elif market_cap >= 2_000_000_000:   # $2B+
            size_category = "mid_cap"
        elif market_cap >= 300_000_000:     # $300M+
            size_category = "small_cap"
        else:
            size_category = "micro_cap"
        
        # Sector-based growth and risk profiles
        sector_profiles = {
            "Technology": {
                "growth": 0.15,
                "terminal": 0.03,
                "discount": 0.12,
                "years": 7,
                "growth_reasoning": "Tech companies typically show high growth potential",
                "terminal_reasoning": "Mature tech companies stabilize around GDP growth",
                "discount_reasoning": "Higher risk due to rapid innovation and competition",
                "years_reasoning": "Longer projection captures growth runway"
            },
            "Healthcare": {
                "growth": 0.08,
                "terminal": 0.025,
                "discount": 0.09,
                "years": 5,
                "growth_reasoning": "Healthcare shows steady, predictable growth",
                "terminal_reasoning": "Aging demographics support steady long-term growth",
                "discount_reasoning": "Moderate risk with regulatory considerations",
                "years_reasoning": "Standard period for stable industries"
            },
            "Financial Services": {
                "growth": 0.06,
                "terminal": 0.02,
                "discount": 0.11,
                "years": 5,
                "growth_reasoning": "Financial services grow with economic expansion",
                "terminal_reasoning": "Long-term growth tied to GDP",
                "discount_reasoning": "Higher risk due to economic sensitivity",
                "years_reasoning": "Standard period for cyclical industries"
            },
            "Consumer Cyclical": {
                "growth": 0.07,
                "terminal": 0.025,
                "discount": 0.10,
                "years": 5,
                "growth_reasoning": "Growth linked to consumer spending trends",
                "terminal_reasoning": "Mature markets stabilize near GDP growth",
                "discount_reasoning": "Moderate risk with economic cycles",
                "years_reasoning": "Captures full economic cycle"
            },
            "Consumer Defensive": {
                "growth": 0.05,
                "terminal": 0.02,
                "discount": 0.08,
                "years": 5,
                "growth_reasoning": "Defensive sectors show stable, lower growth",
                "terminal_reasoning": "Stable demand supports steady terminal growth",
                "discount_reasoning": "Lower risk due to consistent demand",
                "years_reasoning": "Standard period for stable sectors"
            },
            "Energy": {
                "growth": 0.04,
                "terminal": 0.015,
                "discount": 0.12,
                "years": 5,
                "growth_reasoning": "Energy sector faces transition challenges",
                "terminal_reasoning": "Long-term growth uncertainty due to energy transition",
                "discount_reasoning": "Higher risk from commodity prices and regulation",
                "years_reasoning": "Captures near-term trends"
            },
            "Industrials": {
                "growth": 0.06,
                "terminal": 0.025,
                "discount": 0.09,
                "years": 5,
                "growth_reasoning": "Industrial growth follows economic expansion",
                "terminal_reasoning": "Mature industrials stabilize with GDP",
                "discount_reasoning": "Moderate risk with economic sensitivity",
                "years_reasoning": "Standard period for cyclical industries"
            },
            "Real Estate": {
                "growth": 0.04,
                "terminal": 0.02,
                "discount": 0.09,
                "years": 5,
                "growth_reasoning": "Real estate shows stable, dividend-focused returns",
                "terminal_reasoning": "Long-term growth tied to population and GDP",
                "discount_reasoning": "Moderate risk with interest rate sensitivity",
                "years_reasoning": "Standard period for income-focused assets"
            },
            "Utilities": {
                "growth": 0.03,
                "terminal": 0.02,
                "discount": 0.07,
                "years": 5,
                "growth_reasoning": "Utilities show very stable, regulated growth",
                "terminal_reasoning": "Long-term growth matches population and usage",
                "discount_reasoning": "Low risk due to regulated monopolies",
                "years_reasoning": "Standard period for stable sectors"
            },
            "Communication Services": {
                "growth": 0.08,
                "terminal": 0.025,
                "discount": 0.10,
                "years": 6,
                "growth_reasoning": "Communications show steady digital transformation growth",
                "terminal_reasoning": "Mature markets stabilize near GDP growth",
                "discount_reasoning": "Moderate risk with technology evolution",
                "years_reasoning": "Longer period captures digital shift"
            },
            "Materials": {
                "growth": 0.05,
                "terminal": 0.02,
                "discount": 0.10,
                "years": 5,
                "growth_reasoning": "Materials growth linked to industrial demand",
                "terminal_reasoning": "Commodity nature limits long-term growth",
                "discount_reasoning": "Moderate risk from commodity cycles",
                "years_reasoning": "Captures commodity cycle"
            }
        }
        
        # Get sector profile or use default
        profile = sector_profiles.get(sector, {
            "growth": 0.06,
            "terminal": 0.025,
            "discount": 0.10,
            "years": 5,
            "growth_reasoning": "Standard growth rate for diversified companies",
            "terminal_reasoning": "Terminal growth approximates long-term GDP",
            "discount_reasoning": "Standard discount rate for average risk",
            "years_reasoning": "Standard projection period"
        })
        
        # Adjust for company size
        size_adjustments = {
            "mega_cap": {"growth": -0.01, "discount": -0.01, "growth_note": "adjusted down for large cap stability"},
            "large_cap": {"growth": 0, "discount": 0, "growth_note": ""},
            "mid_cap": {"growth": 0.01, "discount": 0.01, "growth_note": "adjusted up for mid-cap growth potential"},
            "small_cap": {"growth": 0.02, "discount": 0.02, "growth_note": "adjusted for small-cap growth and risk"},
            "micro_cap": {"growth": 0.03, "discount": 0.03, "growth_note": "adjusted for micro-cap high growth and risk"}
        }
        
        adjustment = size_adjustments.get(size_category, size_adjustments["large_cap"])
        
        suggested_growth = max(0.01, min(0.30, profile["growth"] + adjustment["growth"]))
        suggested_discount = max(0.06, min(0.20, profile["discount"] + adjustment["discount"]))
        suggested_terminal = profile["terminal"]
        suggested_years = profile["years"]
        
        # Build reasoning with size adjustments
        growth_reasoning = profile["growth_reasoning"]
        if adjustment["growth_note"]:
            growth_reasoning += f" ({adjustment['growth_note']})"
        
        discount_reasoning = profile["discount_reasoning"]
        if adjustment["growth_note"]:
            discount_reasoning += f" ({adjustment['growth_note']})"
        
        return {
            "ticker": ticker.upper(),
            "company_name": company_name,
            "sector": sector,
            "industry": industry,
            "current_price": round(current_price, 2),
            "market_cap": market_cap,
            "size_category": size_category,
            "suggestions": {
                "growth_rate": round(suggested_growth, 4),
                "terminal_growth": round(suggested_terminal, 4),
                "discount_rate": round(suggested_discount, 4),
                "projection_years": suggested_years
            },
            "reasoning": {
                "growth_rate": growth_reasoning,
                "terminal_growth": profile["terminal_reasoning"],
                "discount_rate": discount_reasoning,
                "projection_years": profile["years_reasoning"]
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"DCF suggestions error for {ticker}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not generate suggestions for {ticker}: {str(e)}"
        )


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
    
    ⭐ **Professional Feature:** 20 DCF valuations daily with customizable assumptions!
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