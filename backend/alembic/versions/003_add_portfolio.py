"""Add portfolio table

Revision ID: 003
Revises: 002
Create Date: 2026-01-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # Create portfolio table
    op.create_table(
        'portfolio',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), 
                  primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('users.id', ondelete='CASCADE'), 
                  nullable=False),
        sa.Column('ticker', sa.String(10), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=18, scale=8), nullable=False),
        sa.Column('buy_price', sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column('buy_date', sa.Date(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), 
                  server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), 
                  onupdate=sa.text('CURRENT_TIMESTAMP')),
    )
    
    # Create indexes
    op.create_index('idx_portfolio_user_id', 'portfolio', ['user_id'])
    op.create_index('idx_portfolio_ticker', 'portfolio', ['ticker'])


def downgrade():
    op.drop_index('idx_portfolio_ticker')
    op.drop_index('idx_portfolio_user_id')
    op.drop_table('portfolio')