"""Add is_etf to stock_snapshots and truncate for clean rebuild

Revision ID: 019
Revises: 018
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stock_snapshots', sa.Column('is_etf', sa.Boolean(), nullable=True))
    # Truncate so the refresh job rebuilds the universe from company-screener (ETF-free)
    op.execute('TRUNCATE TABLE stock_snapshots')


def downgrade():
    op.drop_column('stock_snapshots', 'is_etf')
