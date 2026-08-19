from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from datetime import datetime, date
from uuid import UUID
from decimal import Decimal


class PortfolioPositionBase(BaseModel):
    """Base portfolio position schema"""
    ticker: str = Field(..., min_length=1, max_length=10, description="Stock ticker symbol")
    quantity: float = Field(..., gt=0, description="Number of shares")
    buy_price: float = Field(..., gt=0, description="Purchase price per share")
    buy_date: date = Field(..., description="Date of purchase")
    notes: Optional[str] = Field(None, max_length=500, description="Notes about the position")


class PortfolioPositionCreate(PortfolioPositionBase):
    """Schema for creating a portfolio position"""
    pass


class PortfolioPositionUpdate(BaseModel):
    """Schema for updating a portfolio position"""
    quantity: Optional[float] = Field(None, gt=0)
    buy_price: Optional[float] = Field(None, gt=0)
    buy_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)


class PortfolioPositionInDB(PortfolioPositionBase):
    """Portfolio position as stored in database"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class PortfolioPositionResponse(PortfolioPositionInDB):
    """Portfolio position with current market data"""
    current_price: Optional[float] = None
    total_value: Optional[float] = None
    profit_loss: Optional[float] = None
    profit_loss_percent: Optional[float] = None 


class PortfolioResponse(BaseModel):
    """Response containing all portfolio positions.

    NOTE: total_profit_loss / total_profit_loss_percent are UNREALIZED only —
    they are derived from open positions. Their meaning is unchanged by the
    ledger; realized figures are separate fields below.
    """
    positions: list[PortfolioPositionResponse]
    total_current_value: float
    total_profit_loss: float
    total_profit_loss_percent: float
    # Realized figures, summed from the transaction ledger. Defaulted so the
    # frontend and backend can ship in either order.
    total_realized_pl: float = 0.0
    total_realized_pl_percent: float = 0.0
    total_realized_cost_basis: float = 0.0


# --------------------------------------------------------------- ledger

TransactionType = Literal["BUY", "SELL", "ADJUST", "REVERSAL"]


class PortfolioSellRequest(BaseModel):
    """Body for POST /portfolio/positions/{position_id}/sell"""
    quantity: float = Field(..., gt=0, description="Shares to sell")
    sell_price: float = Field(..., gt=0, description="Execution price per share")
    sell_date: date = Field(..., description="Trade date of the sale")
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("sell_date")
    @classmethod
    def not_in_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("sell_date cannot be in the future")
        return v


class PortfolioTransactionResponse(BaseModel):
    """One ledger row.

    Every money/quantity field is `float`, not `Decimal`, deliberately: Pydantic
    v2 serializes Decimal to a JSON *string*, which would make the frontend's
    arithmetic produce NaN.
    """
    id: UUID
    ticker: str
    transaction_type: TransactionType
    quantity: float
    price: float
    transaction_date: date
    amount: float
    cost_basis_per_share: Optional[float] = None
    realized_pl: Optional[float] = None
    realized_pl_percent: Optional[float] = None
    reverses_transaction_id: Optional[UUID] = None
    is_voided: bool = False
    notes: Optional[str] = None
    created_at: datetime


class PortfolioTransactionListResponse(BaseModel):
    """Paginated ledger. Deliberately carries no realized-P/L total: mixing a
    filtered list with an unfiltered aggregate invites wrong numbers. The
    all-time figure lives on PortfolioResponse."""
    transactions: list[PortfolioTransactionResponse]
    total: int
    limit: int
    offset: int


class PortfolioSellResponse(BaseModel):
    """Everything the sell modal needs to confirm without a refetch."""
    transaction_id: UUID
    ticker: str
    quantity_sold: float
    sell_price: float
    sell_date: date
    cost_basis_per_share: float
    realized_pl: float
    realized_pl_percent: float
    proceeds: float
    remaining_quantity: float
    position_closed: bool
    # The refreshed projection row, or None when the position was closed and its
    # holdings row deleted. Ledger history is retained either way.
    position: Optional[PortfolioPositionResponse] = None


class PortfolioVoidResponse(BaseModel):
    """Result of voiding a sale. The original SELL row is never deleted — a
    compensating REVERSAL row is appended instead."""
    reversal_transaction_id: UUID
    voided_transaction_id: UUID
    ticker: str
    quantity_restored: float
    realized_pl_removed: float
    position_reopened: bool
    position: Optional[PortfolioPositionResponse] = None