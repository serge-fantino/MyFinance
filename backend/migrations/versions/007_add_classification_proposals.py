"""Add classification_proposals and classification_proposal_clusters tables.

One classification proposal per (user, account). Stores clusters with user state
(status, overrides, exclusions) for persistence across page reloads.

Revision ID: 007
Revises: 006
Create Date: 2026-02-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "classification_proposals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("distance_threshold", sa.Float(), nullable=False, server_default="0.22"),
        sa.Column("total_uncategorized", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unclustered_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "account_id", name="uq_classification_proposals_user_account"),
    )

    op.create_table(
        "classification_proposal_clusters",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("proposal_id", sa.Integer(), sa.ForeignKey("classification_proposals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cluster_index", sa.Integer(), nullable=False),
        sa.Column("representative_label", sa.String(500), nullable=False),
        sa.Column("transaction_ids", JSONB, nullable=False),
        sa.Column("transactions", JSONB, nullable=False),
        sa.Column("transaction_count", sa.Integer(), nullable=False),
        sa.Column("total_amount_abs", sa.Numeric(12, 2), nullable=False),
        sa.Column("suggested_category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("suggested_category_name", sa.String(255), nullable=True),
        sa.Column("suggestion_confidence", sa.String(20), nullable=True),
        sa.Column("suggestion_source", sa.String(50), nullable=True),
        sa.Column("suggestion_explanation", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("override_category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("rule_pattern", sa.String(500), nullable=True),
        sa.Column("custom_label", sa.String(255), nullable=True),
        sa.Column("excluded_ids", JSONB, nullable=True),
    )
    op.create_index("idx_classification_proposal_clusters_proposal", "classification_proposal_clusters", ["proposal_id"])


def downgrade() -> None:
    op.drop_table("classification_proposal_clusters")
    op.drop_table("classification_proposals")
