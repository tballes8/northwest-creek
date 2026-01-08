"""add_target_price_to_watchlist

Revision ID: 005
Revises: 004
Create Date: 2026-01-08
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use 'watchlists' (plural) not 'watchlist'
    op.add_column('watchlists', 
        sa.Column('target_price', sa.Numeric(precision=18, scale=2), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('watchlists', 'target_price')