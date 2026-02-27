"""EVOL-002: Extended import tracking — ImportRow table, file storage fields, transaction provenance.

Revision ID: 018
Revises: 017
Create Date: 2026-02-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create import_rows table
    op.create_table(
        "import_rows",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("import_log_id", sa.Integer(), sa.ForeignKey("import_logs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("raw_data", JSONB, nullable=False),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("duplicate_of_id", sa.Integer(), sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reject_reason", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_import_rows_import_log_id", "import_rows", ["import_log_id"])
    op.create_index("idx_import_rows_transaction_id", "import_rows", ["transaction_id"])
    op.create_index("idx_import_rows_duplicate_of_id", "import_rows", ["duplicate_of_id"])

    # 2. Add file storage columns to import_logs
    op.add_column("import_logs", sa.Column("file_path", sa.String(500), nullable=True))
    op.add_column("import_logs", sa.Column("file_size", sa.BigInteger(), nullable=True))
    op.add_column("import_logs", sa.Column("file_hash", sa.String(64), nullable=True))
    op.create_index("idx_import_logs_file_hash", "import_logs", ["file_hash"])

    # 3. Make import_logs.account_id nullable (needed for preview phase before account selection)
    op.alter_column("import_logs", "account_id", existing_type=sa.Integer(), nullable=True)

    # 4. Widen dedup_hash to support forced-import suffix (_forced_{row_id})
    op.alter_column("transactions", "dedup_hash", existing_type=sa.String(64), type_=sa.String(100))

    # 5. Add import_log_id FK to transactions
    op.add_column("transactions", sa.Column("import_log_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_transactions_import_log_id",
        "transactions",
        "import_logs",
        ["import_log_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_transactions_import_log_id", "transactions", ["import_log_id"])


def downgrade() -> None:
    # 4. Remove import_log_id from transactions
    op.drop_index("idx_transactions_import_log_id", "transactions")
    op.drop_constraint("fk_transactions_import_log_id", "transactions", type_="foreignkey")
    op.drop_column("transactions", "import_log_id")

    # 3. Make import_logs.account_id non-nullable again
    op.alter_column("import_logs", "account_id", existing_type=sa.Integer(), nullable=False)

    # 2. Remove file storage columns from import_logs
    op.drop_index("idx_import_logs_file_hash", "import_logs")
    op.drop_column("import_logs", "file_hash")
    op.drop_column("import_logs", "file_size")
    op.drop_column("import_logs", "file_path")

    # 1. Drop import_rows table
    op.drop_index("idx_import_rows_duplicate_of_id", "import_rows")
    op.drop_index("idx_import_rows_transaction_id", "import_rows")
    op.drop_index("idx_import_rows_import_log_id", "import_rows")
    op.drop_table("import_rows")
