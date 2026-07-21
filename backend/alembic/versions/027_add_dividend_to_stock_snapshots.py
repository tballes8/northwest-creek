"""Add last_annual_dividend to stock_snapshots

Revision ID: 027
Revises: 026
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa

revision = '027'
down_revision = '026'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stock_snapshots', sa.Column('last_annual_dividend', sa.Numeric(18, 4), nullable=True))


def downgrade():
    op.drop_column('stock_snapshots', 'last_annual_dividend')
