"""Add stripe_customer_id to users table

Revision ID: 015
Revises: 014
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('stripe_customer_id', sa.String(255), nullable=True))
    op.create_index('ix_users_stripe_customer_id', 'users', ['stripe_customer_id'])


def downgrade() -> None:
    op.drop_index('ix_users_stripe_customer_id', table_name='users')
    op.drop_column('users', 'stripe_customer_id')
