"""Add recency-gated dividend fields to stock_snapshots

The screener derived dividend_yield from last_annual_dividend (FMP
/company-screener), which carries no ex-date, so a suspended payer kept
reporting a yield against a collapsed price — NFE showed ~124%. These columns
hold the output of market_data.evaluate_dividend(), which applies the recency
gate that /dividends/{ticker} and portfolio analysis already use, so the
screener stops being the one path that bypasses it.

dividend_annual is the annualized per-share figure (NULL when suspended or
unannualizable); yield stays derived live against price in screener.py.

Revision ID: 032
Revises: 031
Create Date: 2026-08-27
"""
from alembic import op
import sqlalchemy as sa

revision = '032'
down_revision = '031'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stock_snapshots', sa.Column('dividend_annual', sa.Numeric(18, 4), nullable=True))
    op.add_column('stock_snapshots', sa.Column('dividend_status', sa.String(12), nullable=True))
    op.add_column('stock_snapshots', sa.Column('dividend_last_ex_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('stock_snapshots', 'dividend_last_ex_date')
    op.drop_column('stock_snapshots', 'dividend_status')
    op.drop_column('stock_snapshots', 'dividend_annual')
