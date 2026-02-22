"""Initialize transaction_clusters from classification_proposal_clusters.

Backfill: for each accepted proposal cluster, create a corresponding
transaction_cluster. Skips clusters that would have empty transaction_ids
after applying excluded_ids. Skips if a cluster with same user_id and
transaction_ids already exists (idempotent).

Revision ID: 011
Revises: 010
Create Date: 2026-02-22

"""

import json

from alembic import op
from sqlalchemy import text

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Copy accepted classification_proposal_clusters into transaction_clusters."""
    conn = op.get_bind()

    # Fetch accepted proposal clusters with proposal data
    result = conn.execute(
        text("""
            SELECT
                cpc.id,
                cpc.representative_label,
                cpc.custom_label,
                cpc.transaction_ids,
                cpc.excluded_ids,
                cpc.transaction_count,
                cpc.total_amount_abs,
                cpc.override_category_id,
                cpc.suggested_category_id,
                cpc.rule_pattern,
                cp.user_id,
                cp.account_id
            FROM classification_proposal_clusters cpc
            JOIN classification_proposals cp ON cp.id = cpc.proposal_id
            WHERE cpc.status = 'accepted'
        """)
    )
    rows = result.fetchall()

    for row in rows:
        # Filter transaction_ids: exclude excluded_ids
        txn_ids = row.transaction_ids or []
        excluded = set(row.excluded_ids or [])
        filtered_ids = [x for x in txn_ids if x not in excluded]

        if not filtered_ids:
            continue

        # Skip if cluster with same user + transaction_ids already exists
        txn_ids_json = json.dumps(sorted(filtered_ids))
        existing = conn.execute(
            text("""
                SELECT 1 FROM transaction_clusters
                WHERE user_id = :user_id
                  AND source = 'classification'
                  AND transaction_ids @> CAST(:txn_ids AS jsonb)
                  AND jsonb_array_length(transaction_ids) = :count
            """),
            {
                "user_id": row.user_id,
                "txn_ids": txn_ids_json,
                "count": len(filtered_ids),
            },
        )
        if existing.fetchone():
            continue

        name = (row.custom_label or row.representative_label or "Cluster").strip() or row.representative_label
        if len(name) > 255:
            name = name[:252] + "..."

        category_id = row.override_category_id or row.suggested_category_id

        conn.execute(
            text("""
                INSERT INTO transaction_clusters (
                    user_id,
                    account_id,
                    name,
                    category_id,
                    source,
                    rule_pattern,
                    match_type,
                    transaction_ids,
                    transaction_count,
                    total_amount_abs
                ) VALUES (
                    :user_id,
                    :account_id,
                    :name,
                    :category_id,
                    'classification',
                    :rule_pattern,
                    'embedding',
                    CAST(:transaction_ids AS jsonb),
                    :transaction_count,
                    :total_amount_abs
                )
            """),
            {
                "user_id": row.user_id,
                "account_id": row.account_id,
                "name": name,
                "category_id": category_id,
                "rule_pattern": row.rule_pattern,
                "transaction_ids": json.dumps(filtered_ids),
                "transaction_count": len(filtered_ids),
                "total_amount_abs": float(row.total_amount_abs),
            },
        )


def downgrade() -> None:
    """Remove clusters with source='classification'.

    Note: This removes ALL classification-origin clusters, including those
    created via the UI. Cannot distinguish migration-created from UI-created.
    """
    conn = op.get_bind()
    conn.execute(text("DELETE FROM transaction_clusters WHERE source = 'classification'"))
