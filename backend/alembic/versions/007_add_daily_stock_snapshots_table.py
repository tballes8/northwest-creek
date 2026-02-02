"""add daily stock snapshots table

Revision ID: [auto-generated]
Revises: [previous_revision]
Create Date: [auto-generated]
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
import uuid

# revision identifiers, used by Alembic.
revision = '[auto-generated]'
down_revision = '[previous_revision]'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'daily_stock_snapshots',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('ticker', sa.String(10), nullable=False, index=True),
        sa.Column('open_price', sa.Float, nullable=False),
        sa.Column('close_price', sa.Float, nullable=False),
        sa.Column('change_percent', sa.Float, nullable=False),
        sa.Column('snapshot_date', sa.Date, nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    
    # Create index for efficient random selection
    op.create_index(
        'idx_snapshot_date_change',
        'daily_stock_snapshots',
        ['snapshot_date', 'change_percent']
    )


def downgrade():
    op.drop_table('daily_stock_snapshots')