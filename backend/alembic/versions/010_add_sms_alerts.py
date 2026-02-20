"""Add SMS alert support - phone fields on users, sms_enabled on price_alerts

Revision ID: 010
Revises: 009
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── User table: phone verification fields ──────────────────
    op.add_column("users", sa.Column("phone_number", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("phone_verified", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("phone_otp_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("phone_otp_expires", sa.DateTime(timezone=True), nullable=True))

    # ── PriceAlert table: per-alert SMS opt-in ─────────────────
    op.add_column("price_alerts", sa.Column("sms_enabled", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("price_alerts", "sms_enabled")
    op.drop_column("users", "phone_otp_expires")
    op.drop_column("users", "phone_otp_hash")
    op.drop_column("users", "phone_verified")
    op.drop_column("users", "phone_number")