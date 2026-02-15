"""Add keycloak_id to users table, remove password_hash.

Migrates from custom JWT auth to Keycloak OIDC.

Revision ID: 005
Revises: 004
Create Date: 2026-02-15
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add keycloak_id column (nullable first to allow backfill)
    op.add_column("users", sa.Column("keycloak_id", sa.String(255), nullable=True))

    # For existing users, set a placeholder keycloak_id based on their id
    # This should be updated manually during user migration to Keycloak
    op.execute("UPDATE users SET keycloak_id = 'legacy-' || id::text WHERE keycloak_id IS NULL")

    # Now make it NOT NULL and add unique index
    op.alter_column("users", "keycloak_id", nullable=False)
    op.create_index("ix_users_keycloak_id", "users", ["keycloak_id"], unique=True)

    # Remove password_hash (authentication is now handled by Keycloak)
    op.drop_column("users", "password_hash")


def downgrade() -> None:
    # Re-add password_hash
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(255), nullable=True),
    )
    # Set a placeholder hash for existing rows
    op.execute("UPDATE users SET password_hash = 'keycloak-migrated' WHERE password_hash IS NULL")
    op.alter_column("users", "password_hash", nullable=False)

    # Remove keycloak_id
    op.drop_index("ix_users_keycloak_id", table_name="users")
    op.drop_column("users", "keycloak_id")
