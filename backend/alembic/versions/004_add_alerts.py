"""Add price alerts table

Revision ID: 004
Revises: 003
Create Date: 2026-01-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    # Create alerts table
    op.create_table(
        'price_alerts',
        sa.Column('id', postgresql.UUID(as_uuid=True), 
                  server_default=sa.text('uuid_generate_v4()'), 
                  primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), 
                  sa.ForeignKey('users.id', ondelete='CASCADE'), 
                  nullable=False),
        sa.Column('ticker', sa.String(10), nullable=False),
        sa.Column('target_price', sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column('condition', sa.String(10), nullable=False),  # 'above' or 'below'
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), 
                  server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    
    # Create indexes
    op.create_index('idx_alerts_user_id', 'price_alerts', ['user_id'])
    op.create_index('idx_alerts_ticker', 'price_alerts', ['ticker'])
    op.create_index('idx_alerts_active', 'price_alerts', ['is_active'])


def downgrade():
    op.drop_index('idx_alerts_active')
    op.drop_index('idx_alerts_ticker')
    op.drop_index('idx_alerts_user_id')
    op.drop_table('price_alerts')