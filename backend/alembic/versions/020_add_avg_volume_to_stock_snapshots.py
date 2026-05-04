"""Add avg_volume column to stock_snapshots for volume-surge scanner

Revision ID: 020
Revises: 019
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stock_snapshots', sa.Column('avg_volume', sa.Numeric(20, 0), nullable=True))


def downgrade():
    op.drop_column('stock_snapshots', 'avg_volume')
