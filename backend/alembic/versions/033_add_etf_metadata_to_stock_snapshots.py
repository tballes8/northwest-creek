"""Add ETF/fund metadata to stock_snapshots

Groundwork for the screener's ETF mode. Until now stock_snapshots held US common
stocks only — _build_universe requested /company-screener with isEtf=false, so the
"Exclude ETFs & Funds" checkbox toggled a predicate over a column that was never
true. Adding funds to the universe is only half of it: nobody screens ETFs on
sector and beta, they screen on expense ratio, AUM, issuer and asset class, and
none of that was persisted anywhere. It existed solely as a live passthrough in
GET /stocks/etf/{symbol}/info.

These columns are filled by refresh_stock_snapshots._update_etf_metadata from
/stable/etf/info on the daily rebuild.

Two column choices worth recording:

  aum is deliberately separate from market_cap. market_cap comes from batch-quote
  (vendor-derived, and sparse for funds); aum comes from the fund itself. They will
  disagree, and ETF mode filters and sorts on aum.

  expense_ratio is stored as a PERCENT (0.0300 = 3bp, 1.5000 = 1.50%), not a
  fraction. FMP's expenseRatio unit is inconsistent across funds — some rows are a
  percent, some a fraction — and market_data._normalize_expense_ratio reconciles it
  on ingest so every consumer reads one unit.

etf_info_refreshed_at exists because every field above is written with COALESCE:
without a timestamp, a value that is stale because etf/info has been erroring for
three days is indistinguishable from a fresh one.

No index is added. The table is ~10k rows after this change, which Postgres
seq-scans in single-digit ms, while _upsert's on_conflict_do_update rewrites every
row every 15 minutes — 96 full-table rewrites a day, each paying write
amplification per index. If EXPLAIN ANALYZE ever says otherwise, the right index is
partial and matches ETF mode's default sort:
    CREATE INDEX idx_ss_etf_aum ON stock_snapshots (aum DESC NULLS LAST)
        WHERE is_etf IS TRUE;

No TRUNCATE either. Migration 019 truncated because the table was known-
contaminated (ETFs stored with a fabricated is_etf = false). This change is purely
additive: existing rows are already stocks, the new columns default NULL, and the
next daily rebuild adds the ETF rows on its own. After that rebuild is_etf is owned
by the universe build rather than the profile pass, so the values written by
/stable/profile get corrected in place — no backfill needed.

Revision ID: 033
Revises: 032
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa

revision = '033'
down_revision = '032'
branch_labels = None
depends_on = None


def upgrade():
    # Percent, 4dp — same convention as beta. 6/4 admits up to 99.9999%, far past
    # any real fund, so a garbage value is caught by the ceiling in
    # _normalize_expense_ratio rather than by the column.
    op.add_column('stock_snapshots', sa.Column('expense_ratio', sa.Numeric(6, 4), nullable=True))
    # Mirrors market_cap's precision.
    op.add_column('stock_snapshots', sa.Column('aum', sa.Numeric(24, 2), nullable=True))
    # Mirrors price's precision.
    op.add_column('stock_snapshots', sa.Column('nav', sa.Numeric(18, 4), nullable=True))
    op.add_column('stock_snapshots', sa.Column('holdings_count', sa.Integer(), nullable=True))
    op.add_column('stock_snapshots', sa.Column('asset_class', sa.String(50), nullable=True))
    op.add_column('stock_snapshots', sa.Column('etf_company', sa.String(120), nullable=True))
    op.add_column('stock_snapshots', sa.Column('inception_date', sa.Date(), nullable=True))
    op.add_column('stock_snapshots', sa.Column('etf_info_refreshed_at',
                                               sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('stock_snapshots', 'etf_info_refreshed_at')
    op.drop_column('stock_snapshots', 'inception_date')
    op.drop_column('stock_snapshots', 'etf_company')
    op.drop_column('stock_snapshots', 'asset_class')
    op.drop_column('stock_snapshots', 'holdings_count')
    op.drop_column('stock_snapshots', 'nav')
    op.drop_column('stock_snapshots', 'aum')
    op.drop_column('stock_snapshots', 'expense_ratio')
