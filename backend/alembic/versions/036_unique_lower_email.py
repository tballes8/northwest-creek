"""Unique index on lower(email)

Email addresses are case-insensitive. Since 2026-10-30 new addresses are stored
lowercase and every auth lookup compares lower(email) (auth._user_by_email).
This index makes the database enforce one account per address as well,
including two sign-ups racing past the application's existence check.

Safe to build: existing data had no case-variant duplicates (a single account
at the time). If this ever fails on another database, find the duplicates with
  SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;

Revision ID: 036
Revises: 035
Create Date: 2026-10-30
"""
from alembic import op
import sqlalchemy as sa

revision = '036'
down_revision = '035'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_users_email_lower", "users", [sa.text("lower(email)")], unique=True)


def downgrade():
    op.drop_index("ix_users_email_lower", table_name="users")
