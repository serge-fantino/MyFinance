"""Add pgvector extension and embedding column to transactions.

Enables local embedding-based classification using sentence-transformers
and pgvector for similarity search.

Revision ID: 005
Revises: 004
Create Date: 2026-02-08
"""

from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Add embedding column (384 dimensions = paraphrase-multilingual-MiniLM-L12-v2)
    op.execute(
        "ALTER TABLE transactions ADD COLUMN embedding vector(384)"
    )

    # Index for cosine similarity search (HNSW = fast approximate nearest neighbor)
    # Using vector_cosine_ops for cosine distance
    op.execute(
        "CREATE INDEX idx_transactions_embedding ON transactions "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_transactions_embedding")
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS embedding")
    # Note: we don't drop the pgvector extension as other tables may use it
