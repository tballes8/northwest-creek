"""
Company Financials API Endpoints
Provides SEC-sourced financial statements and derived DCF inputs.
⭐ PAID TIERS ONLY (Casual, Active, Professional)

Uses Massive v1 Financials endpoints (Stocks Advanced plan):
  - Income Statements
  - Balance Sheets
  - Cash Flow Statements
  - Ratios
"""
from fastapi import APIRouter, Depends, HTTPException, status
from app.db.models import User
from app.api.dependencies import get_current_user
from app.services.financials import get_company_financials

router = APIRouter()


def require_paid_tier(current_user: User = Depends(get_current_user)):
    """Require paid tier (Casual, Active, or Professional) for financials access"""
    allowed_tiers = ["casual", "active", "professional"]
    if current_user.subscription_tier not in allowed_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Financial summaries require a paid subscription! Current tier: {current_user.subscription_tier.title()}. Upgrade to access this feature!"
        )
    return current_user


@router.get("/{ticker}")
async def get_financials(
    ticker: str,
    current_user: User = Depends(require_paid_tier),
):
    """
    Get comprehensive company financial data:
    - Income Statement (TTM + last 4 quarters)
    - Balance Sheet (latest quarter)
    - Cash Flow Statement (TTM)
    - Ratios (daily-refreshed: P/E, EV/EBITDA, ROE, D/E, etc.)
    - Derived DCF suggestions (growth rate, WACC, FCF, margins)

    Data sourced from SEC XBRL filings via Massive API.
    """
    ticker = ticker.strip().upper()
    if not ticker or len(ticker) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ticker symbol"
        )

    try:
        result = await get_company_financials(ticker)

        # Verify we got meaningful data back
        has_income = result.get("income_statement", {}).get("revenue") is not None
        has_balance = result.get("balance_sheet", {}).get("total_assets") is not None
        has_ratios = result.get("ratios", {}).get("pe_ratio") is not None

        if not has_income and not has_balance and not has_ratios:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No financial data found for {ticker}. This company may not have SEC filings available (e.g., foreign-listed, OTC, or SPAC)."
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Financials error for {ticker}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch financial data for {ticker}: {str(e)}"
        )