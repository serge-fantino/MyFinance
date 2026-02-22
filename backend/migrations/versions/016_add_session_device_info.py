"""Add device_info to user_sessions for human-readable browser/OS display.

Revision ID: 016
Revises: 015
Create Date: 2026-02-22

"""
from alembic import op
import sqlalchemy as sa


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column("device_info", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_sessions", "device_info")
