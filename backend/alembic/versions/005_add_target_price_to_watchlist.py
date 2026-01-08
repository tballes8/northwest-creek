"""add_target_price_to_watchlist

Revision ID: <auto>
Revises: <previous>
Create Date: <auto>
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('watchlist', sa.Column('target_price', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('watchlist', 'target_price')