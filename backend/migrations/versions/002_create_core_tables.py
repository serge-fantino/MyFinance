"""Create accounts, categories, transactions, import_logs tables.

Revision ID: 002
Revises: 001
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Categories ────────────────────────────────────
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])

    # ── Accounts ──────────────────────────────────────
    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("currency", sa.String(3), server_default="EUR", nullable=False),
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("account_number_encrypted", sa.String(512), nullable=True),
        sa.Column("initial_balance", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_accounts_user_id", "accounts", ["user_id"])

    # ── Transactions ──────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("value_date", sa.Date(), nullable=True),
        sa.Column("label_raw", sa.String(500), nullable=False),
        sa.Column("label_clean", sa.String(500), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), server_default="EUR", nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("subcategory", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("tags", ARRAY(sa.String()), nullable=True),
        sa.Column("dedup_hash", sa.String(64), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("ai_confidence", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_transactions_account_date", "transactions", ["account_id", sa.text("date DESC")])
    op.create_index(
        "idx_transactions_dedup", "transactions", ["dedup_hash"],
        unique=True, postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ── Import Logs ───────────────────────────────────
    op.create_table(
        "import_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("format", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=True),
        sa.Column("imported_count", sa.Integer(), nullable=True),
        sa.Column("duplicate_count", sa.Integer(), nullable=True),
        sa.Column("error_count", sa.Integer(), nullable=True),
        sa.Column("errors_detail", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── Seed default categories ───────────────────────
    op.execute("""
        INSERT INTO categories (name, parent_id, icon, color, is_system) VALUES
        -- Top-level
        ('Revenus', NULL, 'trending-up', '#22c55e', true),
        ('Depenses', NULL, 'trending-down', '#ef4444', true),
        ('Transferts', NULL, 'arrow-left-right', '#6366f1', true);
    """)
    # Sub-categories: Revenus (parent_id=1)
    op.execute("""
        INSERT INTO categories (name, parent_id, icon, color, is_system) VALUES
        ('Salaire', 1, 'briefcase', '#22c55e', true),
        ('Freelance', 1, 'laptop', '#22c55e', true),
        ('Investissements', 1, 'bar-chart', '#22c55e', true),
        ('Autres revenus', 1, 'plus-circle', '#22c55e', true);
    """)
    # Sub-categories: Depenses (parent_id=2)
    op.execute("""
        INSERT INTO categories (name, parent_id, icon, color, is_system) VALUES
        ('Logement', 2, 'home', '#f97316', true),
        ('Alimentation', 2, 'shopping-cart', '#eab308', true),
        ('Transport', 2, 'car', '#3b82f6', true),
        ('Sante', 2, 'heart', '#ec4899', true),
        ('Loisirs', 2, 'film', '#8b5cf6', true),
        ('Shopping', 2, 'shopping-bag', '#f43f5e', true),
        ('Education', 2, 'book-open', '#0ea5e9', true),
        ('Epargne & Investissement', 2, 'piggy-bank', '#10b981', true),
        ('Impots & Taxes', 2, 'file-text', '#64748b', true),
        ('Divers', 2, 'more-horizontal', '#94a3b8', true);
    """)
    # Sub-categories: Transferts (parent_id=3)
    op.execute("""
        INSERT INTO categories (name, parent_id, icon, color, is_system) VALUES
        ('Virement entre comptes', 3, 'repeat', '#6366f1', true);
    """)


def downgrade() -> None:
    op.drop_table("import_logs")
    op.drop_table("transactions")
    op.drop_table("accounts")
    op.drop_table("categories")
