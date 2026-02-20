"""Add bank_id and branch_id to accounts for OFX import matching.

Revision ID: 008
Revises: 007
Create Date: 2026-02-08

"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("bank_id", sa.String(50), nullable=True))
    op.add_column("accounts", sa.Column("branch_id", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "branch_id")
    op.drop_column("accounts", "bank_id")
