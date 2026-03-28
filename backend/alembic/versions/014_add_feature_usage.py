"""Add feature_usage table for time-based tier limit enforcement

Revision ID: 014
Revises: 013
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'feature_usage',
        sa.Column('id', postgresql.UUID(as_uuid=True),
                  server_default=sa.text('uuid_generate_v4()'),
                  primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('feature', sa.String(50), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True),
                  server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    op.create_index('idx_feature_usage_user_feature', 'feature_usage',
                     ['user_id', 'feature'])
    op.create_index('idx_feature_usage_used_at', 'feature_usage', ['used_at'])


def downgrade():
    op.drop_index('idx_feature_usage_used_at')
    op.drop_index('idx_feature_usage_user_feature')
    op.drop_table('feature_usage')
