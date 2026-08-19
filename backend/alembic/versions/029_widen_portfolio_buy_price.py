"""Widen portfolio.buy_price to 4 decimal places

Revision ID: 029
Revises: 028
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa

revision = '029'
down_revision = '028'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'portfolio',
        'buy_price',
        existing_type=sa.Numeric(precision=18, scale=2),
        type_=sa.Numeric(precision=18, scale=4),
        existing_nullable=False,
    )


def downgrade():
    # Rounds any sub-cent precision back to 2 places.
    op.alter_column(
        'portfolio',
        'buy_price',
        existing_type=sa.Numeric(precision=18, scale=4),
        type_=sa.Numeric(precision=18, scale=2),
        existing_nullable=False,
    )
