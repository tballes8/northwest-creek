"""Add macro_indicators table for AI economic cycle phase synthesis

Revision ID: 022
Revises: 021
Create Date: 2026-05-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'macro_indicators',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('series_id', sa.String(40), nullable=False),
        sa.Column('observation_date', sa.Date, nullable=False),
        sa.Column('value', sa.Numeric(18, 6), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('series_id', name='uq_macro_indicator_series_id'),
    )
    op.create_index('idx_macro_indicator_series_id', 'macro_indicators', ['series_id'])


def downgrade():
    op.drop_index('idx_macro_indicator_series_id', table_name='macro_indicators')
    op.drop_table('macro_indicators')
