"""Add company profile fields to stock_snapshots

Revision ID: 023_add_company_profile_fields
Revises: 022_add_macro_indicators
Create Date: 2025-01-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '023_add_company_profile_fields'
down_revision = '022_add_macro_indicators'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add sector, industry, and description columns to stock_snapshots table
    op.add_column('stock_snapshots',
                  sa.Column('sector', sa.String(100), nullable=True))
    op.add_column('stock_snapshots',
                  sa.Column('industry', sa.String(200), nullable=True))
    op.add_column('stock_snapshots',
                  sa.Column('description', sa.Text(), nullable=True))

    # Create indexes for better search performance
    op.create_index('idx_ss_sector', 'stock_snapshots', ['sector'])
    op.create_index('idx_ss_industry', 'stock_snapshots', ['industry'])

    # Create a GIN index for full-text search on description
    # This allows efficient keyword searching within company descriptions
    op.execute("""
        CREATE INDEX idx_ss_description_fts
        ON stock_snapshots
        USING gin(to_tsvector('english', COALESCE(description, '')))
    """)

    # Create a combined full-text search index for all searchable fields
    op.execute("""
        CREATE INDEX idx_ss_combined_fts
        ON stock_snapshots
        USING gin(to_tsvector('english',
            COALESCE(name, '') || ' ' ||
            COALESCE(sector, '') || ' ' ||
            COALESCE(industry, '') || ' ' ||
            COALESCE(description, '')
        ))
    """)


def downgrade() -> None:
    # Remove indexes first
    op.drop_index('idx_ss_combined_fts', table_name='stock_snapshots')
    op.drop_index('idx_ss_description_fts', table_name='stock_snapshots')
    op.drop_index('idx_ss_industry', table_name='stock_snapshots')
    op.drop_index('idx_ss_sector', table_name='stock_snapshots')

    # Remove columns
    op.drop_column('stock_snapshots', 'description')
    op.drop_column('stock_snapshots', 'industry')
    op.drop_column('stock_snapshots', 'sector')