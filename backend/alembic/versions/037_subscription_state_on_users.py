"""Subscription state on users

Stores each user's Stripe subscription state so the server can enforce it on
every request without calling Stripe (site review M8, M10). Written only by
app/services/subscription_sync.py; read by app/core/entitlements.py.

Also re-enables every account. Until now is_active=False meant "subscription
lapsed" (set by the subscription.deleted webhook and the immediate cancel; nothing
else ever set it), and that is what subscription_status records from here on.
is_active now means "account enabled".

Also creates users.is_admin if it is missing. The model has always had it, but no
migration ever created it, so production has it from outside Alembic while a
database built from migrations alone does not (and then every User load fails).
The access rule reads it; IF NOT EXISTS makes this a no-op where it exists.

New columns start empty. The reconcile job (subscription_sync.reconcile_subscriptions)
runs at startup and fills them in from Stripe for every user not yet synced; until
it reaches a user, that user's first page load syncs them on demand.

Revision ID: 037
Revises: 036
Create Date: 2026-10-31
"""
from alembic import op
import sqlalchemy as sa

revision = '037'
down_revision = '036'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false")
    op.add_column('users', sa.Column('subscription_status', sa.String(32), nullable=True))
    op.add_column('users', sa.Column('stripe_subscription_id', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('trial_end', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('cancel_at_period_end', sa.Boolean(), nullable=False,
                                     server_default=sa.false()))
    op.add_column('users', sa.Column('has_had_trial', sa.Boolean(), nullable=False,
                                     server_default=sa.false()))
    op.add_column('users', sa.Column('subscription_synced_at', sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE users SET is_active = true WHERE is_active IS NOT TRUE")


def downgrade():
    # Lapsed accounts are not re-locked: is_active can't be reconstructed. Before
    # downgrading the code, set is_active = false for users whose
    # subscription_status is not active/trialing. is_admin stays: production
    # had it before this migration.
    op.drop_column('users', 'subscription_synced_at')
    op.drop_column('users', 'has_had_trial')
    op.drop_column('users', 'cancel_at_period_end')
    op.drop_column('users', 'current_period_end')
    op.drop_column('users', 'trial_end')
    op.drop_column('users', 'stripe_subscription_id')
    op.drop_column('users', 'subscription_status')
