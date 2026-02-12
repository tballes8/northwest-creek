"""add tutorials, blog posts, and admin flag

Revision ID: 008
Revises: 007
Create Date: 2026-02-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Create tutorials table
    op.create_table(
        'tutorials',
        sa.Column('id', UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('youtube_url', sa.String(500), nullable=True),
        sa.Column('video_url', sa.String(500), nullable=True),
        sa.Column('thumbnail_url', sa.String(500), nullable=True),
        sa.Column('category', sa.String(100), server_default='General', nullable=True),
        sa.Column('display_order', sa.Integer(), server_default='0', nullable=True),
        sa.Column('is_published', sa.Boolean(), server_default=sa.text('false'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_tutorials_published', 'tutorials', ['is_published', 'display_order'])
    op.create_index('idx_tutorials_category', 'tutorials', ['category'])

    # 2. Create blog_posts table
    op.create_table(
        'blog_posts',
        sa.Column('id', UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(300), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('excerpt', sa.Text(), nullable=True),
        sa.Column('cover_image_url', sa.String(500), nullable=True),
        sa.Column('category', sa.String(100), server_default='General', nullable=True),
        sa.Column('tags', sa.String(500), nullable=True),
        sa.Column('is_published', sa.Boolean(), server_default=sa.text('false'), nullable=True),
        sa.Column('author_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_blog_posts_slug', 'blog_posts', ['slug'], unique=True)
    op.create_index('idx_blog_posts_published', 'blog_posts', ['is_published', 'created_at'])
    op.create_index('idx_blog_posts_category', 'blog_posts', ['category'])


def downgrade():
    op.drop_table('blog_posts')
    op.drop_table('tutorials')