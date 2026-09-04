"""
Company Financials API Endpoints
Provides financial statements and derived DCF inputs via FMP.
⭐ ALL PAID TIERS (Beginner, Casual, Active, Professional)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from app.db.models import User
from app.api.dependencies import get_current_user
from app.services.financials_service import get_company_financials
from app.services.edgar_identity import is_contradicted

router = APIRouter()


def require_valid_tier(current_user: User = Depends(get_current_user)):
    """Validate user has a recognized subscription tier for financials access"""
    allowed_tiers = ["beginner", "casual", "active", "professional"]
    if current_user.subscription_tier not in allowed_tiers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Financial summaries require a valid subscription. Current tier: {current_user.subscription_tier.title()}. Please contact support."
        )
    return current_user


@router.get("/{ticker}")
async def get_financials(
    ticker: str,
    current_user: User = Depends(require_valid_tier),
):
    """
    Get comprehensive company financial data:
    - Income Statement (TTM + last 4 quarters)
    - Balance Sheet (latest quarter)
    - Cash Flow Statement (TTM)
    - Ratios (daily-refreshed: P/E, EV/EBITDA, ROE, D/E, etc.)
    - Derived DCF suggestions (growth rate, WACC, FCF, margins)

    Data sourced from Financial Modeling Prep (FMP).
    """
    ticker = ticker.strip().upper()
    if not ticker or len(ticker) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ticker symbol"
        )

    try:
        result = await get_company_financials(ticker)

        # A wrong-entity payload is deliberately blank, so it must be returned
        # before the emptiness check below — otherwise it 404s as "no financial
        # data", which is both wrong and the opposite of informative: the data
        # exists, the vendor has simply attached the wrong company's to this
        # symbol. The verdict carries the explanation; the frontend blocks on it.
        if is_contradicted(result.get("entity_trust")):
            return result

        # Verify we got meaningful data back
        has_income = (result.get("income_statement") or {}).get("revenue") is not None
        has_balance = (result.get("balance_sheet") or {}).get("total_assets") is not None
        has_ratios = (result.get("ratios") or {}).get("pe_ratio") is not None

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