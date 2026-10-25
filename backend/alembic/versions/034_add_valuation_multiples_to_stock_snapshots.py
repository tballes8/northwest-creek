"""Add valuation multiples (P/E, P/B, EV/EBITDA) to stock_snapshots

The screener could find stocks that were out of favour (near a 52-week low, below the
200-day MA) but not stocks that were actually cheap — no valuation multiple was
persisted anywhere it could filter on. These columns back the screener's P/E, P/B and
EV/EBITDA range filters and the "Deep Value" preset.

Filled by refresh_stock_snapshots._update_valuations from /stable/ratios-ttm on the
daily rebuild — the same three fields financials_service shows on the company page, so
a stock's screener P/E and its Financials-tab P/E are the same number.

Storage conventions:

  A non-positive multiple is stored as NULL. Negative earnings, book value or EBITDA
  produce a negative ratio that is not "cheap", it is not meaningful (NM). Storing it
  would let a "P/E at most 15" screen return every loss-maker.

  Not COALESCE-guarded, unlike the profile and ETF passes. A company that swings to a
  loss must be able to clear its stored P/E back to NULL. A failed fetch skips the row
  instead, and valuation_refreshed_at shows how old a figure is.

  fmp_cik is the CIK FMP's profile reports for the ticker, written by the profile pass.
  The valuation pass compares it to SEC EDGAR's CIK for the ticker and nulls all three
  multiples on a contradiction, so the screener never ranks one company on another's
  figures. valuation_trust stores that verdict for inspection.

No index, for the reason recorded in 033: the table is seq-scanned in single-digit ms
and is rewritten every 15 minutes.

Revision ID: 034
Revises: 033
Create Date: 2026-10-24
"""
from alembic import op
import sqlalchemy as sa

revision = '034'
down_revision = '033'
branch_labels = None
depends_on = None


def upgrade():
    # 14/4 admits multiples up to ~10^10. The ingest path drops anything past 10^9 so
    # a garbage vendor value costs that field, not the whole batch UPDATE.
    op.add_column('stock_snapshots', sa.Column('pe_ratio', sa.Numeric(14, 4), nullable=True))
    op.add_column('stock_snapshots', sa.Column('pb_ratio', sa.Numeric(14, 4), nullable=True))
    op.add_column('stock_snapshots', sa.Column('ev_to_ebitda', sa.Numeric(14, 4), nullable=True))
    op.add_column('stock_snapshots', sa.Column('fmp_cik', sa.BigInteger(), nullable=True))
    op.add_column('stock_snapshots', sa.Column('valuation_trust', sa.String(24), nullable=True))
    op.add_column('stock_snapshots', sa.Column('valuation_refreshed_at',
                                               sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('stock_snapshots', 'valuation_refreshed_at')
    op.drop_column('stock_snapshots', 'valuation_trust')
    op.drop_column('stock_snapshots', 'fmp_cik')
    op.drop_column('stock_snapshots', 'ev_to_ebitda')
    op.drop_column('stock_snapshots', 'pb_ratio')
    op.drop_column('stock_snapshots', 'pe_ratio')
