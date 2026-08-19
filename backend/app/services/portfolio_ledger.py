"""
Portfolio Transaction Ledger — append-only record of every buy and sell.

The `portfolio` table is a materialized projection of *current* holdings
(quantity + average cost). This module writes the ledger rows that explain how
a holding got to its current state, and computes realized P/L from them.

NOTHING IS EVER DELETED FROM THE LEDGER. A mistyped sale is corrected with
`record_reversal`, which appends a compensating row carrying the negated
realized_pl. That makes `SUM(realized_pl)` net out correctly with no
special-casing at any call site, and leaves both the error and its correction
visible in the user's history.

TRANSACTION BOUNDARY: none of these functions commit. They db.add() and return.
The calling endpoint owns the commit, which is what makes the ledger write and
the holdings-projection update a single atomic transaction. Never add a commit
here.

PRECISION: all arithmetic is Decimal, quantized to the DB column scales. Floats
arrive from Pydantic at the API boundary and are converted with Decimal(str(v))
— never Decimal(v), which would carry the float's binary representation error
into the stored money value.
"""
from datetime import date as date_type
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PortfolioTransaction

# Match the column scales in models.py / migration 030 exactly.
QTY_Q = Decimal("0.00000001")    # numeric(18,8)
MONEY_Q = Decimal("0.0001")      # numeric(18,4)

BUY = "BUY"
SELL = "SELL"
ADJUST = "ADJUST"
REVERSAL = "REVERSAL"

# Types that carry a realized P/L figure and therefore count toward the
# realized aggregate.
REALIZING_TYPES = (SELL, REVERSAL)


def to_qty(value) -> Decimal:
    """Coerce anything numeric to the ledger's quantity precision."""
    return Decimal(str(value)).quantize(QTY_Q, rounding=ROUND_HALF_UP)


def to_money(value) -> Decimal:
    """Coerce anything numeric to the ledger's money precision."""
    return Decimal(str(value)).quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def fmt_qty(value) -> str:
    """Human-readable share count: 100.00000000 -> "100", 7.50000000 -> "7.5".

    Decimals carry their full column scale, so interpolating one straight into a
    user-facing message produces "you only hold 100.00000000".
    """
    return format(to_qty(value).normalize(), "f")


def fmt_money(value) -> str:
    """Human-readable price, keeping at least 2 decimals: 10 -> "10.00",
    0.3272 -> "0.3272"."""
    text = format(to_money(value).normalize(), "f")
    if "." not in text:
        return text + ".00"
    whole, frac = text.split(".")
    return whole + "." + frac.ljust(2, "0")


async def record_buy(
    db: AsyncSession,
    *,
    user_id: UUID,
    ticker: str,
    quantity: Decimal,
    price: Decimal,
    transaction_date: date_type,
    notes: Optional[str] = None,
) -> PortfolioTransaction:
    """Append a BUY.

    For a purchase added to an existing holding, pass the *incremental* shares
    and the price actually paid — not the merged weighted-average totals. The
    ledger records the event; the projection records the resulting state.
    """
    txn = PortfolioTransaction(
        user_id=user_id,
        ticker=ticker.upper(),
        transaction_type=BUY,
        quantity=to_qty(quantity),
        price=to_money(price),
        transaction_date=transaction_date,
        notes=notes,
    )
    db.add(txn)
    return txn


async def record_sell(
    db: AsyncSession,
    *,
    user_id: UUID,
    ticker: str,
    quantity: Decimal,
    price: Decimal,
    transaction_date: date_type,
    cost_basis_per_share: Decimal,
    notes: Optional[str] = None,
) -> PortfolioTransaction:
    """Append a SELL and compute its realized P/L.

    `cost_basis_per_share` must be the holding's average cost at the moment of
    sale. Storing it (rather than recomputing later from the projection) is what
    freezes this trade's realized P/L against any future change to the holding,
    and is the seam a later FIFO implementation needs.
    """
    qty = to_qty(quantity)
    sell_price = to_money(price)
    basis = to_money(cost_basis_per_share)

    txn = PortfolioTransaction(
        user_id=user_id,
        ticker=ticker.upper(),
        transaction_type=SELL,
        quantity=qty,
        price=sell_price,
        transaction_date=transaction_date,
        cost_basis_per_share=basis,
        realized_pl=to_money((sell_price - basis) * qty),
        notes=notes,
    )
    db.add(txn)
    return txn


async def record_adjustment(
    db: AsyncSession,
    *,
    user_id: UUID,
    ticker: str,
    quantity: Decimal,
    price: Decimal,
    transaction_date: date_type,
    notes: str,
) -> PortfolioTransaction:
    """Append an ADJUST checkpoint restating a holding's absolute state.

    Used for manual edits and for position removal (quantity 0). Deliberately a
    checkpoint rather than a delta: a delta would need a signed quantity, which
    forces an exception into the quantity CHECK constraint, and "the state is
    now X" is what a manual edit actually means. Reconciliation reads the latest
    ADJUST for a ticker as its baseline and applies subsequent rows.

    An adjustment realizes nothing, so cost_basis_per_share and realized_pl stay
    NULL.
    """
    txn = PortfolioTransaction(
        user_id=user_id,
        ticker=ticker.upper(),
        transaction_type=ADJUST,
        quantity=to_qty(quantity),
        price=to_money(price),
        transaction_date=transaction_date,
        notes=notes,
    )
    db.add(txn)
    return txn


async def record_reversal(
    db: AsyncSession,
    *,
    sell_txn: PortfolioTransaction,
    notes: Optional[str] = None,
) -> PortfolioTransaction:
    """Append a REVERSAL voiding `sell_txn`. Never deletes the original.

    Carries the same quantity, price and cost basis as the sale, with
    realized_pl negated, so the realized aggregate nets to zero. The unique
    constraint on reverses_transaction_id is what prevents a double void.
    """
    txn = PortfolioTransaction(
        user_id=sell_txn.user_id,
        ticker=sell_txn.ticker,
        transaction_type=REVERSAL,
        quantity=to_qty(sell_txn.quantity),
        price=to_money(sell_txn.price),
        transaction_date=sell_txn.transaction_date,
        cost_basis_per_share=to_money(sell_txn.cost_basis_per_share),
        realized_pl=to_money(-to_money(sell_txn.realized_pl)),
        reverses_transaction_id=sell_txn.id,
        notes=notes or f"Voided sale of {fmt_qty(sell_txn.quantity)} {sell_txn.ticker}",
    )
    db.add(txn)
    return txn


async def realized_summary(db: AsyncSession, user_id: UUID) -> Tuple[Decimal, Decimal]:
    """Return (total_realized_pl, total_realized_cost_basis) for a user.

    One indexed query over the realizing types.

    realized_pl needs no special handling: a REVERSAL already stores the negated
    figure, so the sum cancels. The cost basis DOES need it -- a REVERSAL carries
    a positive quantity and a positive cost_basis_per_share (the CHECK constraint
    requires quantity > 0), so summing it raw would add a voided sale's basis
    back instead of removing it, inflating the denominator behind
    total_realized_pl_percent.
    """
    basis = PortfolioTransaction.cost_basis_per_share * PortfolioTransaction.quantity
    signed_basis = case(
        (PortfolioTransaction.transaction_type == REVERSAL, -basis),
        else_=basis,
    )

    result = await db.execute(
        select(
            func.coalesce(func.sum(PortfolioTransaction.realized_pl), 0),
            func.coalesce(func.sum(signed_basis), 0),
        ).where(
            PortfolioTransaction.user_id == user_id,
            PortfolioTransaction.transaction_type.in_(REALIZING_TYPES),
        )
    )
    total_pl, total_basis = result.one()
    return to_money(total_pl), to_money(total_basis)


async def earliest_buy_date(
    db: AsyncSession, user_id: UUID, ticker: str
) -> Optional[date_type]:
    """Earliest BUY date for a ticker — used to restore buy_date when a void
    resurrects a fully-closed position."""
    result = await db.execute(
        select(func.min(PortfolioTransaction.transaction_date)).where(
            PortfolioTransaction.user_id == user_id,
            PortfolioTransaction.ticker == ticker.upper(),
            PortfolioTransaction.transaction_type == BUY,
        )
    )
    return result.scalar()


async def is_voided(db: AsyncSession, transaction_id: UUID) -> bool:
    """True if a REVERSAL already references this transaction."""
    result = await db.execute(
        select(func.count(PortfolioTransaction.id)).where(
            PortfolioTransaction.reverses_transaction_id == transaction_id
        )
    )
    return (result.scalar() or 0) > 0
