"""
Portfolio endpoints - Track your investments
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from typing import List, Optional
from uuid import UUID
from decimal import Decimal

from app.db.session import get_db
from app.api.dependencies import get_current_user
from app.db.models import User, Portfolio, PortfolioTransaction
from app.schemas import portfolio as schemas
from app.services.market_data import market_data_service
from app.services import portfolio_ledger as ledger
from app.core.tier_limits import get_tier_limit, get_upgrade_tier

router = APIRouter()


async def check_portfolio_limit(user: User, current_count: int) -> None:
    """Check if user has reached their portfolio limit"""
    limit = get_tier_limit(user.subscription_tier, "portfolio_entries")
    
    if current_count >= limit:
        next_tier = get_upgrade_tier(user.subscription_tier)
        if next_tier:
            next_limit = get_tier_limit(next_tier, "portfolio_entries")
            upgrade_msg = f" Upgrade to {next_tier.capitalize()} for {next_limit} positions."
        else:
            upgrade_msg = ""
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Portfolio limit reached. {user.subscription_tier.capitalize()} tier allows {limit} positions.{upgrade_msg}"
        )


async def enrich_portfolio_with_prices(items: List[Portfolio]) -> List[schemas.PortfolioPositionResponse]:
    """Enrich portfolio positions with current market data (single batch API call)"""
    if not items:
        return []

    # Fetch all quotes in one API call
    tickers = [item.ticker for item in items]
    quotes = await market_data_service.get_batch_quotes(tickers)

    enriched_items = []
    for item in items:
        quote = quotes.get(item.ticker.upper(), {})

        current_price = None
        total_value = None
        profit_loss = None
        profit_loss_percent = None

        if quote.get('price'):
            current_price = float(quote.get('price'))
            total_value = current_price * float(item.quantity)
            cost_basis = float(item.buy_price) * float(item.quantity)
            profit_loss = total_value - cost_basis
            profit_loss_percent = (profit_loss / cost_basis) * 100 if cost_basis > 0 else 0

        enriched_items.append(schemas.PortfolioPositionResponse(
            id=item.id,
            user_id=item.user_id,
            ticker=item.ticker,
            quantity=float(item.quantity),
            buy_price=float(item.buy_price),
            buy_date=item.buy_date,
            notes=item.notes,
            created_at=item.created_at,
            updated_at=item.updated_at,
            current_price=current_price,
            total_value=total_value,
            profit_loss=profit_loss,
            profit_loss_percent=profit_loss_percent
        ))

    return enriched_items


@router.get("", response_model=schemas.PortfolioResponse)
async def get_portfolio(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's portfolio with current market data and totals"""
    # Get all positions from database
    result = await db.execute(
        select(Portfolio)
        .where(Portfolio.user_id == current_user.id)
        .order_by(Portfolio.created_at.desc())
    )
    positions = result.scalars().all()  # Extract list from Result
    
    # Enrich positions with current prices
    enriched_positions = await enrich_portfolio_with_prices(positions)  # Use your existing function
    
    # Calculate totals from enriched data
    total_current_value = 0.0
    total_cost_basis = 0.0
    
    for position in enriched_positions:
        if position.total_value is not None:
            total_current_value += position.total_value
        cost_basis = position.quantity * position.buy_price
        total_cost_basis += cost_basis
    
    # Calculate profit/loss (unrealized — open positions only)
    total_profit_loss = total_current_value - total_cost_basis
    total_profit_loss_percent = (
        (total_profit_loss / total_cost_basis * 100) if total_cost_basis > 0 else 0
    )

    # Realized P/L comes from the ledger, not from open positions — a fully
    # exited holding has no row here but its gain must still be reported. One
    # indexed query; this endpoint is not on the 30s price-refresh path.
    realized_pl, realized_basis = await ledger.realized_summary(db, current_user.id)
    realized_pl_percent = (
        float(realized_pl / realized_basis * 100) if realized_basis > 0 else 0.0
    )

    return schemas.PortfolioResponse(  # Return proper typed response
        positions=enriched_positions,
        total_current_value=total_current_value,
        total_profit_loss=total_profit_loss,
        total_profit_loss_percent=total_profit_loss_percent,
        total_realized_pl=float(realized_pl),
        total_realized_pl_percent=realized_pl_percent,
        total_realized_cost_basis=float(realized_basis)
    )


@router.post("/positions", response_model=schemas.PortfolioPositionResponse, status_code=status.HTTP_201_CREATED)
async def add_position(
    position_data: schemas.PortfolioPositionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a position to portfolio"""
    # NOTE: the portfolio limit is checked *after* the duplicate-ticker lookup
    # below, not here. Adding shares to a ticker you already hold merges into the
    # existing row and creates no new position, so gating it on the position
    # count produced a spurious 403 for any user sitting at their tier cap.

    # Verify ticker is valid by fetching quote
    try:
        quote = await market_data_service.get_quote(position_data.ticker)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ticker symbol: {position_data.ticker}"
        )

    # Check if ticker already exists in portfolio — aggregate if so
    # FOR UPDATE so a concurrent sell of the same holding cannot interleave
    # with the read-modify-write of the weighted average below.
    existing_result = await db.execute(
        select(Portfolio).where(
            and_(
                Portfolio.user_id == current_user.id,
                Portfolio.ticker == position_data.ticker.upper()
            )
        ).with_for_update()
    )
    existing = existing_result.scalar_one_or_none()

    add_qty = ledger.to_qty(position_data.quantity)
    add_price = ledger.to_money(position_data.buy_price)

    if existing:
        # Recalculate weighted average cost basis. Decimal throughout: quantity
        # is numeric(18,8) and float arithmetic here would round the stored
        # basis. Only a purchase ever blends the average - a sale must never
        # reach this path.
        old_qty = ledger.to_qty(existing.quantity)
        old_price = ledger.to_money(existing.buy_price)
        combined_qty = old_qty + add_qty
        avg_cost = (old_qty * old_price + add_qty * add_price) / combined_qty

        existing.quantity = combined_qty
        existing.buy_price = ledger.to_money(avg_cost)
        # Keep the earlier buy_date
        if position_data.buy_date < existing.buy_date:
            existing.buy_date = position_data.buy_date
        # Append notes if provided
        if position_data.notes:
            existing.notes = f"{existing.notes}\n{position_data.notes}" if existing.notes else position_data.notes

        db_item = existing
    else:
        # Only a genuinely new position consumes a slot against the tier limit.
        count_result = await db.execute(
            select(func.count(Portfolio.id))
            .where(Portfolio.user_id == current_user.id)
        )
        current_count = count_result.scalar() or 0
        await check_portfolio_limit(current_user, current_count)

        db_item = Portfolio(
            user_id=current_user.id,
            ticker=position_data.ticker.upper(),
            quantity=add_qty,
            buy_price=add_price,
            buy_date=position_data.buy_date,
            notes=position_data.notes
        )
        db.add(db_item)

    # The ledger records the purchase event: the incremental shares at the price
    # actually paid, never the merged weighted-average totals. This is what
    # preserves the individual buys the merge above discards, and is the
    # groundwork for a later FIFO implementation.
    await ledger.record_buy(
        db,
        user_id=current_user.id,
        ticker=position_data.ticker,
        quantity=add_qty,
        price=add_price,
        transaction_date=position_data.buy_date,
        notes=position_data.notes,
    )

    await db.commit()
    await db.refresh(db_item)
    
    # Return with current price data
    enriched = await enrich_portfolio_with_prices([db_item])
    return enriched[0]


@router.put("/positions/{position_id}", response_model=schemas.PortfolioPositionResponse)
async def update_position(
    position_id: UUID,
    position_data: schemas.PortfolioPositionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update portfolio position"""
    result = await db.execute(
        select(Portfolio).where(
            and_(
                Portfolio.id == position_id,
                Portfolio.user_id == current_user.id
            )
        ).with_for_update()
    )
    db_item = result.scalar_one_or_none()

    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio position not found"
        )

    prev_qty = ledger.to_qty(db_item.quantity)
    prev_price = ledger.to_money(db_item.buy_price)

    # Update fields
    if position_data.quantity is not None:
        db_item.quantity = ledger.to_qty(position_data.quantity)
    if position_data.buy_price is not None:
        db_item.buy_price = ledger.to_money(position_data.buy_price)
    if position_data.buy_date is not None:
        db_item.buy_date = position_data.buy_date
    if position_data.notes is not None:
        db_item.notes = position_data.notes

    # A manual edit has no trade semantics, but leaving it out of the ledger
    # would let the ledger and the holdings projection drift apart silently -
    # and the user's history would show shares they never bought. So record an
    # ADJUST checkpoint of the restated absolute state. Only a change to
    # quantity or basis is a checkpoint-worthy event; a notes-only or
    # date-only edit is not.
    new_qty = ledger.to_qty(db_item.quantity)
    new_price = ledger.to_money(db_item.buy_price)

    if new_qty != prev_qty or new_price != prev_price:
        change = (
            f"Position edited: {ledger.fmt_qty(prev_qty)} -> "
            f"{ledger.fmt_qty(new_qty)} shares, "
            f"${ledger.fmt_money(prev_price)} -> "
            f"${ledger.fmt_money(new_price)} average cost"
        )
        if position_data.notes:
            change = f"{change}. {position_data.notes}"
        await ledger.record_adjustment(
            db,
            user_id=current_user.id,
            ticker=db_item.ticker,
            quantity=new_qty,
            price=new_price,
            transaction_date=db_item.buy_date,
            notes=change,
        )

    await db.commit()
    await db.refresh(db_item)
    
    # Return with current price data
    enriched = await enrich_portfolio_with_prices([db_item])
    return enriched[0]


@router.delete("/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_position(
    position_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a position from portfolio.

    Remove means "I entered this by mistake / stop tracking it", NOT "I sold
    it" - use the sell endpoint for an actual exit. The holdings row goes, but
    a zero-quantity checkpoint is appended first, and this ticker's existing
    ledger rows are never touched: a user who sold half and then removed the
    position still realized that gain.
    """
    result = await db.execute(
        select(Portfolio).where(
            and_(
                Portfolio.id == position_id,
                Portfolio.user_id == current_user.id
            )
        ).with_for_update()
    )
    db_item = result.scalar_one_or_none()

    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio position not found"
        )

    # price carries the last known basis (informative, and satisfies price > 0).
    # The checkpoint quantity is 0 by definition, so the shares that went away
    # are recorded in the notes instead - without them, restoring a position
    # removed by mistake means reconstructing the count from every prior BUY
    # and SELL row for the ticker.
    await ledger.record_adjustment(
        db,
        user_id=current_user.id,
        ticker=db_item.ticker,
        quantity=0,
        price=ledger.to_money(db_item.buy_price),
        transaction_date=db_item.buy_date,
        notes=(
            f"Position removed from portfolio (not a sale): "
            f"{ledger.fmt_qty(db_item.quantity)} shares @ "
            f"${ledger.fmt_money(db_item.buy_price)} avg cost"
        ),
    )

    await db.delete(db_item)
    await db.commit()

    return None


@router.post(
    "/positions/{position_id}/sell",
    response_model=schemas.PortfolioSellResponse,
)
async def sell_position(
    position_id: UUID,
    sell_data: schemas.PortfolioSellRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Sell some or all of a position, recording the realized gain or loss.

    A sale does NOT change the per-share cost basis. Under average-cost
    accounting it only reduces quantity and realizes a gain; running the sell
    price through the weighted-average formula the way a purchase goes through
    it would corrupt the basis and every P/L figure derived from it.
    """
    # FOR UPDATE is what makes the oversell check meaningful: without the row
    # lock, two concurrent sells both read the same quantity, both validate, and
    # both write. Postgres defaults to READ COMMITTED, so the second request
    # blocks here and then re-reads the decremented quantity, correctly failing
    # the check below.
    result = await db.execute(
        select(Portfolio).where(
            and_(
                Portfolio.id == position_id,
                Portfolio.user_id == current_user.id
            )
        ).with_for_update()
    )
    position = result.scalar_one_or_none()

    if not position:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio position not found"
        )

    held = ledger.to_qty(position.quantity)
    sold = ledger.to_qty(sell_data.quantity)
    avg_cost = ledger.to_money(position.buy_price)
    sell_price = ledger.to_money(sell_data.sell_price)
    ticker = position.ticker

    if sold > held:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot sell {ledger.fmt_qty(sold)} shares of {ticker} - "
                f"you only hold {ledger.fmt_qty(held)}."
            )
        )

    if sell_data.sell_date < position.buy_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Sell date cannot be before the position's buy date "
                f"({position.buy_date})."
            )
        )

    # NOTE: no live-quote validation here, unlike add_position. The ticker was
    # validated when the position was created; a halted or delisted ticker is
    # exactly when a user needs to record an exit; and network I/O must never
    # happen while holding a row lock.
    txn = await ledger.record_sell(
        db,
        user_id=current_user.id,
        ticker=ticker,
        quantity=sold,
        price=sell_price,
        transaction_date=sell_data.sell_date,
        cost_basis_per_share=avg_cost,
        notes=sell_data.notes,
    )

    # INVARIANT: buy_price is never touched. This is the line a future edit is
    # most likely to get wrong.
    remaining = held - sold
    position_closed = remaining == 0

    if position_closed:
        # Holdings row only. Every ledger row for this ticker is retained, so
        # the closed trade and its realized P/L survive.
        await db.delete(position)
    else:
        position.quantity = remaining

    # One transaction: ledger row and projection update commit together.
    await db.commit()

    realized_pl = ledger.to_money(txn.realized_pl)
    proceeds = ledger.to_money(sell_price * sold)
    realized_pct = (
        float((sell_price - avg_cost) / avg_cost * 100) if avg_cost > 0 else 0.0
    )

    # Enrich after the commit, never under the lock. get_batch_quotes swallows
    # its own failures and returns {}, and enrich_portfolio_with_prices leaves
    # the price fields None on a missing quote, so no guard is needed here.
    enriched = None
    if not position_closed:
        await db.refresh(position)
        enriched_list = await enrich_portfolio_with_prices([position])
        enriched = enriched_list[0] if enriched_list else None

    return schemas.PortfolioSellResponse(
        transaction_id=txn.id,
        ticker=ticker,
        quantity_sold=float(sold),
        sell_price=float(sell_price),
        sell_date=sell_data.sell_date,
        cost_basis_per_share=float(avg_cost),
        realized_pl=float(realized_pl),
        realized_pl_percent=realized_pct,
        proceeds=float(proceeds),
        remaining_quantity=float(remaining),
        position_closed=position_closed,
        position=enriched
    )


@router.post(
    "/transactions/{transaction_id}/void",
    response_model=schemas.PortfolioVoidResponse,
)
async def void_transaction(
    transaction_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Void a recorded sale by appending a compensating REVERSAL row.

    The original SELL row is never deleted. The REVERSAL carries the negated
    realized P/L, so the realized aggregate nets to zero and the history shows
    both the mistake and the correction.

    Average-cost accounting makes this order-independent, so any sale can be
    voided, not just the most recent one. Restoring the shares along with the
    basis they were sold at lands on the correct average regardless of what
    happened afterwards:

        buy 10@10, sell 5, buy 5@20  ->  qty 10, avg 15 (basis 150)
        void the sell  ->  qty 15, basis 150 + (5 * 10) = 200, avg 13.3333
        ground truth   ->  (10*10 + 5*20) / 15 = 13.3333
    """
    result = await db.execute(
        select(PortfolioTransaction).where(
            and_(
                PortfolioTransaction.id == transaction_id,
                PortfolioTransaction.user_id == current_user.id
            )
        )
    )
    sell_txn = result.scalar_one_or_none()

    if not sell_txn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )

    if sell_txn.transaction_type != ledger.SELL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Only a sale can be voided. This is a "
                f"{sell_txn.transaction_type} transaction."
            )
        )

    if await ledger.is_voided(db, sell_txn.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This sale has already been voided."
        )

    qty = ledger.to_qty(sell_txn.quantity)
    basis = ledger.to_money(sell_txn.cost_basis_per_share)
    realized_removed = ledger.to_money(sell_txn.realized_pl)
    ticker = sell_txn.ticker

    position_result = await db.execute(
        select(Portfolio).where(
            and_(
                Portfolio.user_id == current_user.id,
                Portfolio.ticker == ticker
            )
        ).with_for_update()
    )
    position = position_result.scalar_one_or_none()

    if position:
        # Restore both the shares and the basis they were sold at, then
        # recompute the average over the combined total.
        old_qty = ledger.to_qty(position.quantity)
        old_basis = ledger.to_money(position.buy_price) * old_qty
        new_qty = old_qty + qty
        new_basis = old_basis + (basis * qty)
        position.quantity = new_qty
        position.buy_price = ledger.to_money(new_basis / new_qty)
        position_reopened = False
    else:
        # The sale had closed the position and its holdings row was deleted, so
        # voiding has to resurrect it. That reclaims a slot against the tier
        # limit, which may have been refilled in the meantime.
        count_result = await db.execute(
            select(func.count(Portfolio.id))
            .where(Portfolio.user_id == current_user.id)
        )
        await check_portfolio_limit(current_user, count_result.scalar() or 0)

        buy_date = await ledger.earliest_buy_date(db, current_user.id, ticker)
        position = Portfolio(
            user_id=current_user.id,
            ticker=ticker,
            quantity=qty,
            buy_price=basis,
            buy_date=buy_date or sell_txn.transaction_date,
            notes=None,
        )
        db.add(position)
        position_reopened = True

    reversal = await ledger.record_reversal(db, sell_txn=sell_txn)

    await db.commit()

    await db.refresh(position)
    enriched_list = await enrich_portfolio_with_prices([position])
    enriched = enriched_list[0] if enriched_list else None

    return schemas.PortfolioVoidResponse(
        reversal_transaction_id=reversal.id,
        voided_transaction_id=sell_txn.id,
        ticker=ticker,
        quantity_restored=float(qty),
        realized_pl_removed=float(realized_removed),
        position_reopened=position_reopened,
        position=enriched
    )


@router.get("/transactions", response_model=schemas.PortfolioTransactionListResponse)
async def get_transactions(
    ticker: Optional[str] = None,
    transaction_type: Optional[str] = Query(
        None, pattern="^(BUY|SELL|ADJUST|REVERSAL)$"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """The user's transaction ledger, newest first."""
    filters = [PortfolioTransaction.user_id == current_user.id]
    if ticker:
        filters.append(PortfolioTransaction.ticker == ticker.upper())
    if transaction_type:
        filters.append(PortfolioTransaction.transaction_type == transaction_type)

    count_result = await db.execute(
        select(func.count(PortfolioTransaction.id)).where(and_(*filters))
    )
    total = count_result.scalar() or 0

    # transaction_date is what the user reported; created_at breaks ties for
    # several trades booked on the same day.
    result = await db.execute(
        select(PortfolioTransaction)
        .where(and_(*filters))
        .order_by(
            PortfolioTransaction.transaction_date.desc(),
            PortfolioTransaction.created_at.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    rows = result.scalars().all()

    # Which of these sales have been voided, in one query rather than per row.
    voided_ids = set()
    sell_ids = [r.id for r in rows if r.transaction_type == ledger.SELL]
    if sell_ids:
        voided_result = await db.execute(
            select(PortfolioTransaction.reverses_transaction_id).where(
                PortfolioTransaction.reverses_transaction_id.in_(sell_ids)
            )
        )
        voided_ids = {row for row in voided_result.scalars().all() if row}

    transactions = []
    for row in rows:
        qty = float(row.quantity)
        price = float(row.price)
        basis = float(row.cost_basis_per_share) if row.cost_basis_per_share is not None else None
        realized = float(row.realized_pl) if row.realized_pl is not None else None
        realized_pct = None
        if basis is not None and basis > 0 and row.transaction_type in ledger.REALIZING_TYPES:
            realized_pct = (price / basis - 1) * 100
            if row.transaction_type == ledger.REVERSAL:
                realized_pct = -realized_pct

        transactions.append(schemas.PortfolioTransactionResponse(
            id=row.id,
            ticker=row.ticker,
            transaction_type=row.transaction_type,
            quantity=qty,
            price=price,
            transaction_date=row.transaction_date,
            amount=qty * price,
            cost_basis_per_share=basis,
            realized_pl=realized,
            realized_pl_percent=realized_pct,
            reverses_transaction_id=row.reverses_transaction_id,
            is_voided=row.id in voided_ids,
            notes=row.notes,
            created_at=row.created_at
        ))

    return schemas.PortfolioTransactionListResponse(
        transactions=transactions,
        total=total,
        limit=limit,
        offset=offset
    )
