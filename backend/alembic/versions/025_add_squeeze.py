"""Add squeeze columns to stock_snapshots and ticker_daily_bars table

Revision ID: 025
Revises: 024
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '025'
down_revision = '024'
branch_labels = None
depends_on = None


def upgrade():
    # Precomputed squeeze state on the screener universe
    op.add_column('stock_snapshots', sa.Column('squeeze_state', sa.String(8), nullable=True))
    op.add_column('stock_snapshots', sa.Column('squeeze_bars', sa.Integer(), nullable=True))
    op.add_column('stock_snapshots', sa.Column('squeeze_computed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('idx_ss_squeeze_state', 'stock_snapshots', ['squeeze_state'])

    # Rolling daily OHLC history feeding the squeeze precompute job
    op.create_table(
        'ticker_daily_bars',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('bar_date', sa.Date(), nullable=False),
        sa.Column('open', sa.Numeric(18, 4), nullable=True),
        sa.Column('high', sa.Numeric(18, 4), nullable=True),
        sa.Column('low', sa.Numeric(18, 4), nullable=True),
        sa.Column('close', sa.Numeric(18, 4), nullable=True),
        sa.UniqueConstraint('symbol', 'bar_date', name='uq_ticker_daily_bar'),
    )
    op.create_index('idx_tdb_symbol', 'ticker_daily_bars', ['symbol'])


def downgrade():
    op.drop_index('idx_tdb_symbol', table_name='ticker_daily_bars')
    op.drop_table('ticker_daily_bars')
    op.drop_index('idx_ss_squeeze_state', table_name='stock_snapshots')
    op.drop_column('stock_snapshots', 'squeeze_computed_at')
    op.drop_column('stock_snapshots', 'squeeze_bars')
    op.drop_column('stock_snapshots', 'squeeze_state')
