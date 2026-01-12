"""add_email_verification

Revision ID: 006
Revises: 005
Create Date: 2026-01-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add verification columns
    op.add_column('users', sa.Column('verification_token', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('verification_token_expires', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Remove verification columns
    op.drop_column('users', 'verification_token_expires')
    op.drop_column('users', 'verification_token')