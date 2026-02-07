"""Add balance reference fields to accounts table.

Allows users to calibrate their account balance by providing a known
balance at a specific date. The system then back-calculates initial_balance.

Revision ID: 003
Revises: 002
Create Date: 2026-02-07
"""

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("balance_reference_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "accounts",
        sa.Column("balance_reference_amount", sa.Numeric(12, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("accounts", "balance_reference_amount")
    op.drop_column("accounts", "balance_reference_date")
