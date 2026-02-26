"""Rename subscription_tier 'free' to 'beginner' and update default

Revision ID: 012
Revises: 011
"""
from alembic import op

# revision identifiers
revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update all existing users with tier 'free' to 'beginner'
    op.execute("UPDATE users SET subscription_tier = 'beginner' WHERE subscription_tier = 'free'")

    # 2. Change the column default from 'free' to 'beginner'
    op.alter_column(
        "users",
        "subscription_tier",
        server_default="beginner",
    )


def downgrade() -> None:
    # Revert default
    op.alter_column(
        "users",
        "subscription_tier",
        server_default="free",
    )
    # Revert data
    op.execute("UPDATE users SET subscription_tier = 'free' WHERE subscription_tier = 'beginner'")