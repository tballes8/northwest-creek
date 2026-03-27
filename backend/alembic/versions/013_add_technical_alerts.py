"""Add technical alerts table for indicator-based alerts

Revision ID: 013
Revises: 012
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'technical_alerts',
        sa.Column('id', postgresql.UUID(as_uuid=True),
                  server_default=sa.text('uuid_generate_v4()'),
                  primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('ticker', sa.String(10), nullable=False),
        sa.Column('alert_type', sa.String(30), nullable=False),
        sa.Column('config', postgresql.JSONB(), nullable=False),
        sa.Column('last_state', postgresql.JSONB(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('sms_enabled', sa.Boolean(), server_default=sa.text('false')),
        sa.Column('triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trigger_details', postgresql.JSONB(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    op.create_index('idx_tech_alerts_user_id', 'technical_alerts', ['user_id'])
    op.create_index('idx_tech_alerts_ticker', 'technical_alerts', ['ticker'])
    op.create_index('idx_tech_alerts_active', 'technical_alerts', ['is_active'])
    op.create_index('idx_tech_alerts_type', 'technical_alerts', ['alert_type'])


def downgrade():
    op.drop_index('idx_tech_alerts_type')
    op.drop_index('idx_tech_alerts_active')
    op.drop_index('idx_tech_alerts_ticker')
    op.drop_index('idx_tech_alerts_user_id')
    op.drop_table('technical_alerts')
