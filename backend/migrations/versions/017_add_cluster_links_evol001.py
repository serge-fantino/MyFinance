"""EVOL-001: Add cluster_id to classification_rules and transaction_cluster_id to proposal clusters.

Enables simplified cluster growth: rules link to their TransactionCluster,
and ProposalClusters can reference existing TCs for merge-on-confirm workflow.

Revision ID: 017
Revises: 016
Create Date: 2026-02-26

"""
from alembic import op
import sqlalchemy as sa


revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add cluster_id to classification_rules (rule → TransactionCluster back-reference)
    op.add_column(
        "classification_rules",
        sa.Column("cluster_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_classification_rules_cluster_id",
        "classification_rules",
        "transaction_clusters",
        ["cluster_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_classification_rules_cluster_id",
        "classification_rules",
        ["cluster_id"],
    )

    # Add transaction_cluster_id to classification_proposal_clusters (proposal → TC link)
    op.add_column(
        "classification_proposal_clusters",
        sa.Column("transaction_cluster_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_proposal_clusters_transaction_cluster_id",
        "classification_proposal_clusters",
        "transaction_clusters",
        ["transaction_cluster_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_proposal_clusters_transaction_cluster_id",
        "classification_proposal_clusters",
        ["transaction_cluster_id"],
    )

    # Backfill: set rule.cluster_id from existing TransactionCluster.rule_id links
    op.execute("""
        UPDATE classification_rules r
        SET cluster_id = tc.id
        FROM transaction_clusters tc
        WHERE tc.rule_id = r.id
          AND r.cluster_id IS NULL
    """)


def downgrade() -> None:
    op.drop_index("idx_proposal_clusters_transaction_cluster_id", "classification_proposal_clusters")
    op.drop_constraint("fk_proposal_clusters_transaction_cluster_id", "classification_proposal_clusters", type_="foreignkey")
    op.drop_column("classification_proposal_clusters", "transaction_cluster_id")

    op.drop_index("idx_classification_rules_cluster_id", "classification_rules")
    op.drop_constraint("fk_classification_rules_cluster_id", "classification_rules", type_="foreignkey")
    op.drop_column("classification_rules", "cluster_id")
