"""Add squeeze_ratio to stock_snapshots

Revision ID: 026
Revises: 025
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = '026'
down_revision = '025'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stock_snapshots', sa.Column('squeeze_ratio', sa.Numeric(10, 4), nullable=True))


def downgrade():
    op.drop_column('stock_snapshots', 'squeeze_ratio')
