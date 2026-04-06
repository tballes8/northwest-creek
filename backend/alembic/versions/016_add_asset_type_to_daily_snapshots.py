"""Add asset_type to daily_stock_snapshots table

Revision ID: 016
Revises: 015
Create Date: 2026-04-06
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'daily_stock_snapshots',
        sa.Column('asset_type', sa.String(length=20), nullable=True)
    )
    op.create_index(
        'idx_snapshot_asset_type',
        'daily_stock_snapshots',
        ['asset_type']
    )


def downgrade():
    op.drop_index('idx_snapshot_asset_type', table_name='daily_stock_snapshots')
    op.drop_column('daily_stock_snapshots', 'asset_type')
