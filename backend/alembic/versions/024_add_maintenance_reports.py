"""Add maintenance_reports table (Admin vendor changelog reviews)

Revision ID: 024
Revises: 023
Create Date: 2026-06-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'maintenance_reports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('vendor', sa.String(length=50), nullable=False, server_default='FMP'),
        sa.Column('source_text', sa.Text(), nullable=False),
        sa.Column('report_markdown', sa.Text(), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_maintenance_reports_created_at', 'maintenance_reports', ['created_at'])


def downgrade() -> None:
    op.drop_index('idx_maintenance_reports_created_at', table_name='maintenance_reports')
    op.drop_table('maintenance_reports')
