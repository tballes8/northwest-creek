"""Add saved_screens table

Revision ID: 018
Revises: 017
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'saved_screens',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('criteria', postgresql.JSONB, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_saved_screens_user_id', 'saved_screens', ['user_id'])


def downgrade():
    op.drop_index('idx_saved_screens_user_id', table_name='saved_screens')
    op.drop_table('saved_screens')
