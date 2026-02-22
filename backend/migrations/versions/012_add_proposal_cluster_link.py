"""Add proposal_cluster_id link to transaction_clusters.

Lifetime link between transaction_clusters and classification_proposal_clusters.
When a cluster is created from a proposal (apply or from-proposal), we store
the source proposal cluster ID for traceability.

Revision ID: 012
Revises: 011
Create Date: 2026-02-22

"""

from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transaction_clusters",
        sa.Column(
            "proposal_cluster_id",
            sa.Integer(),
            sa.ForeignKey("classification_proposal_clusters.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("transaction_clusters", "proposal_cluster_id")
