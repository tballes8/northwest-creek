"""Add watchlists table

Revision ID: 002
Revises: 001
Create Date: 2026-01-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    # Create watchlists table
    op.create_table(
        'watchlists',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), 
                  primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('users.id', ondelete='CASCADE'), 
                  nullable=False),
        sa.Column('ticker', sa.String(10), nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True), 
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    
    # Create composite unique index (user can't add same ticker twice)
    op.create_index(
        'idx_watchlists_user_ticker', 
        'watchlists', 
        ['user_id', 'ticker'], 
        unique=True
    )
    
    # Create index on user_id for faster lookups
    op.create_index('idx_watchlists_user_id', 'watchlists', ['user_id'])


def downgrade():
    op.drop_index('idx_watchlists_user_id')
    op.drop_index('idx_watchlists_user_ticker')
    op.drop_table('watchlists')