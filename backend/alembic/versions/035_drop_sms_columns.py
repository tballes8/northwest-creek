"""Drop the SMS / phone columns

SMS alerts were removed on 2026-10-30: Twilio is no longer used, and the
feature never went live, so these columns hold no data. The models stopped
mapping them in the same change. Dropping them keeps the schema in step with
the models, so `alembic revision --autogenerate` doesn't slip these drops into
some unrelated future migration.

Revision ID: 035
Revises: 034
Create Date: 2026-10-30
"""
from alembic import op
import sqlalchemy as sa

revision = '035'
down_revision = '034'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("users", "phone_number")
    op.drop_column("users", "phone_verified")
    op.drop_column("users", "phone_otp_hash")
    op.drop_column("users", "phone_otp_expires")
    op.drop_column("price_alerts", "sms_enabled")
    op.drop_column("technical_alerts", "sms_enabled")


def downgrade():
    # Recreates the columns as 010 / 013 defined them (empty)
    op.add_column("technical_alerts", sa.Column("sms_enabled", sa.Boolean(), server_default=sa.text("false")))
    op.add_column("price_alerts", sa.Column("sms_enabled", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("phone_otp_expires", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("phone_otp_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("phone_verified", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("phone_number", sa.String(20), nullable=True))
