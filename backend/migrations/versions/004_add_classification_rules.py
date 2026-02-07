"""Add classification_rules table.

Stores pattern-based rules for automatic transaction classification.

Revision ID: 004
Revises: 003
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "classification_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("pattern", sa.String(500), nullable=False),
        sa.Column("match_type", sa.String(20), server_default="contains", nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("custom_label", sa.String(255), nullable=True),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_by", sa.String(20), server_default="manual", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "idx_classification_rules_user_active",
        "classification_rules",
        ["user_id", "is_active"],
    )


def downgrade() -> None:
    op.drop_index("idx_classification_rules_user_active")
    op.drop_table("classification_rules")
