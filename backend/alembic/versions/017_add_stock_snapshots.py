"""Add stock_snapshots table for screener

Revision ID: 017
Revises: 016
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'stock_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('price', sa.Numeric(18, 4), nullable=True),
        sa.Column('change_percentage', sa.Numeric(10, 4), nullable=True),
        sa.Column('change', sa.Numeric(18, 4), nullable=True),
        sa.Column('volume', sa.Numeric(20, 0), nullable=True),
        sa.Column('day_low', sa.Numeric(18, 4), nullable=True),
        sa.Column('day_high', sa.Numeric(18, 4), nullable=True),
        sa.Column('year_high', sa.Numeric(18, 4), nullable=True),
        sa.Column('year_low', sa.Numeric(18, 4), nullable=True),
        sa.Column('market_cap', sa.Numeric(24, 2), nullable=True),
        sa.Column('price_avg_50', sa.Numeric(18, 4), nullable=True),
        sa.Column('price_avg_200', sa.Numeric(18, 4), nullable=True),
        sa.Column('exchange', sa.String(20), nullable=True),
        sa.Column('open_price', sa.Numeric(18, 4), nullable=True),
        sa.Column('previous_close', sa.Numeric(18, 4), nullable=True),
        sa.Column('fmp_timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_refreshed', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('symbol', name='uq_stock_snapshots_symbol'),
    )
    op.create_index('idx_ss_market_cap', 'stock_snapshots', ['market_cap'])
    op.create_index('idx_ss_price_avg_50', 'stock_snapshots', ['price_avg_50'])
    op.create_index('idx_ss_price_avg_200', 'stock_snapshots', ['price_avg_200'])
    op.create_index('idx_ss_change_pct', 'stock_snapshots', ['change_percentage'])


def downgrade():
    op.drop_index('idx_ss_change_pct', table_name='stock_snapshots')
    op.drop_index('idx_ss_price_avg_200', table_name='stock_snapshots')
    op.drop_index('idx_ss_price_avg_50', table_name='stock_snapshots')
    op.drop_index('idx_ss_market_cap', table_name='stock_snapshots')
    op.drop_table('stock_snapshots')
