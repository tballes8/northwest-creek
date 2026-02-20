"""add daily stock snapshots table

Revision ID: 007
Revises: 006
Create Date: 2026-02-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    # Drop existing table if it exists (handles manual creation)
    op.execute('DROP TABLE IF EXISTS daily_stock_snapshots CASCADE')
    
    # Create table with correct structure
    op.create_table(
        'daily_stock_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('ticker', sa.String(10), nullable=False),
        sa.Column('open_price', sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column('close_price', sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column('change_percent', sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('ix_daily_stock_snapshots_ticker', 'daily_stock_snapshots', ['ticker'])
    op.create_index('ix_daily_stock_snapshots_snapshot_date', 'daily_stock_snapshots', ['snapshot_date'])
    op.create_index('idx_snapshot_date_change', 'daily_stock_snapshots', ['snapshot_date', 'change_percent'])


def downgrade():
    op.drop_table('daily_stock_snapshots')