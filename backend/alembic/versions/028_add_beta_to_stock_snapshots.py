"""Add beta to stock_snapshots

Revision ID: 028
Revises: 027
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa

revision = '028'
down_revision = '027'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stock_snapshots', sa.Column('beta', sa.Numeric(10, 4), nullable=True))


def downgrade():
    op.drop_column('stock_snapshots', 'beta')
