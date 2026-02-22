"""Add cluster_id to transactions to avoid re-classifying.

Revision ID: 014
Revises: 013
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("cluster_id", sa.Integer(), sa.ForeignKey("transaction_clusters.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_transactions_cluster", "transactions", ["cluster_id"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_transactions_cluster", table_name="transactions")
    op.drop_column("transactions", "cluster_id")
