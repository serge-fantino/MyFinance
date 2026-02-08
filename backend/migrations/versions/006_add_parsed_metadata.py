"""Add parsed_metadata JSONB column to transactions.

Stores structured metadata extracted from raw bank labels by the label parser:
payment mode, counterparty, card ID, operation date, etc.

Revision ID: 006
Revises: 005
Create Date: 2026-02-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("parsed_metadata", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "parsed_metadata")
