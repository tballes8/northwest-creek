"""Add sector_etf_daily_closes table for sector rotation heatmap

Revision ID: 021
Revises: 020
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '021'
down_revision = '020'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sector_etf_daily_closes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('ticker', sa.String(10), nullable=False),
        sa.Column('close_date', sa.Date, nullable=False),
        sa.Column('close_price', sa.Numeric(18, 4), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('ticker', 'close_date', name='uq_sector_etf_ticker_date'),
    )
    op.create_index('idx_sector_etf_ticker', 'sector_etf_daily_closes', ['ticker'])
    op.create_index('idx_sector_etf_close_date', 'sector_etf_daily_closes', ['close_date'])


def downgrade():
    op.drop_index('idx_sector_etf_close_date', table_name='sector_etf_daily_closes')
    op.drop_index('idx_sector_etf_ticker', table_name='sector_etf_daily_closes')
    op.drop_table('sector_etf_daily_closes')
