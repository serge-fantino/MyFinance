"""Add category hierarchy levels and transaction_clusters table.

- Categories: add level, level1_id, level2_id for fast hierarchy navigation
- Transaction clusters: persistent grouping with statistics

Revision ID: 010
Revises: 009
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Category hierarchy levels ─────────────────────
    op.add_column("categories", sa.Column("level", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("categories", sa.Column("level1_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True))
    op.add_column("categories", sa.Column("level2_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True))

    # Populate level fields for existing categories
    # Root categories (no parent) → level=1, level1_id=self.id
    op.execute("""
        UPDATE categories
        SET level = 1, level1_id = id
        WHERE parent_id IS NULL
    """)
    # Level-2 categories (parent has no parent) → level=2, level1_id=parent_id, level2_id=self.id
    op.execute("""
        UPDATE categories c
        SET level = 2,
            level1_id = c.parent_id,
            level2_id = c.id
        WHERE c.parent_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM categories p
              WHERE p.id = c.parent_id AND p.parent_id IS NULL
          )
    """)
    # Level-3+ categories (parent's parent exists) → level=3, level1_id=grandparent, level2_id=parent
    op.execute("""
        UPDATE categories c
        SET level = 3,
            level1_id = p.parent_id,
            level2_id = c.parent_id
        WHERE c.parent_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM categories p
              WHERE p.id = c.parent_id AND p.parent_id IS NOT NULL
          )
    """)

    # ── Transaction clusters table ────────────────────
    op.create_table(
        "transaction_clusters",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("rule_id", sa.Integer(), sa.ForeignKey("classification_rules.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rule_pattern", sa.String(500), nullable=True),
        sa.Column("match_type", sa.String(20), nullable=True),
        sa.Column("transaction_ids", JSONB, nullable=False, server_default="[]"),
        sa.Column("transaction_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("total_amount_abs", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("min_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("max_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("stddev_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("avg_days_between", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_recurring", sa.Boolean(), nullable=True),
        sa.Column("recurrence_pattern", sa.String(30), nullable=True),
        sa.Column("first_date", sa.String(10), nullable=True),
        sa.Column("last_date", sa.String(10), nullable=True),
        sa.Column("statistics", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("idx_transaction_clusters_user_account", "transaction_clusters", ["user_id", "account_id"])
    op.create_index("idx_transaction_clusters_category", "transaction_clusters", ["category_id"])


def downgrade() -> None:
    op.drop_table("transaction_clusters")
    op.drop_column("categories", "level2_id")
    op.drop_column("categories", "level1_id")
    op.drop_column("categories", "level")
