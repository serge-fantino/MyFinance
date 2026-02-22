"""Create transaction_clusters from label_clean (libellé personnalisé).

Groups transactions that share the same label_clean (custom label, e.g. "Loyer Boulogne",
"Amazon") and are not already in any cluster. Creates one cluster per (user, label_clean).

Revision ID: 013
Revises: 012
Create Date: 2026-02-22

"""

import json
from collections import defaultdict

from alembic import op
from sqlalchemy import text

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create clusters from transactions grouped by label_clean."""
    conn = op.get_bind()

    # 1. Get all transaction IDs already in any cluster
    result = conn.execute(
        text("""
            SELECT tc.transaction_ids
            FROM transaction_clusters tc
        """)
    )
    already_clustered: set[int] = set()
    for row in result:
        ids = row.transaction_ids or []
        already_clustered.update(ids)

    # 2. Get transactions with label_clean, with user_id from account
    result = conn.execute(
        text("""
            SELECT t.id, t.account_id, t.label_clean, t.category_id, t.amount, a.user_id
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.deleted_at IS NULL
              AND t.label_clean IS NOT NULL
              AND TRIM(t.label_clean) != ''
        """)
    )
    rows = result.fetchall()

    # 3. Group by (user_id, label_clean), excluding already-clustered txns
    groups: dict[tuple[int, str], list[dict]] = defaultdict(list)
    for row in rows:
        if row.id in already_clustered:
            continue
        key = (row.user_id, row.label_clean.strip())
        groups[key].append({
            "id": row.id,
            "account_id": row.account_id,
            "category_id": row.category_id,
            "amount": float(row.amount),
        })

    # 4. Create cluster for each group with at least 2 transactions
    for (user_id, label_clean), txns in groups.items():
        if len(txns) < 2:
            continue

        txn_ids = [t["id"] for t in txns]
        total_abs = sum(abs(t["amount"]) for t in txns)

        # Infer account_id: use if all same, else null
        account_ids = {t["account_id"] for t in txns}
        account_id = account_ids.pop() if len(account_ids) == 1 else None

        # Infer category_id: use most common, or first
        cat_counts: dict[int | None, int] = defaultdict(int)
        for t in txns:
            cat_counts[t["category_id"]] += 1
        category_id = max(cat_counts, key=cat_counts.get) if cat_counts else None

        name = label_clean[:252] + "..." if len(label_clean) > 255 else label_clean

        # Skip if cluster with same user + label_clean already exists
        existing = conn.execute(
            text("""
                SELECT 1 FROM transaction_clusters
                WHERE user_id = :user_id
                  AND source = 'label_clean'
                  AND name = :name
            """),
            {"user_id": user_id, "name": name},
        )
        if existing.fetchone():
            continue

        conn.execute(
            text("""
                INSERT INTO transaction_clusters (
                    user_id,
                    account_id,
                    name,
                    category_id,
                    source,
                    match_type,
                    transaction_ids,
                    transaction_count,
                    total_amount_abs
                ) VALUES (
                    :user_id,
                    :account_id,
                    :name,
                    :category_id,
                    'label_clean',
                    'label_clean',
                    CAST(:transaction_ids AS jsonb),
                    :transaction_count,
                    :total_amount_abs
                )
            """),
            {
                "user_id": user_id,
                "account_id": account_id,
                "name": name,
                "category_id": category_id,
                "transaction_ids": json.dumps(txn_ids),
                "transaction_count": len(txn_ids),
                "total_amount_abs": round(total_abs, 2),
            },
        )


def downgrade() -> None:
    """Remove clusters created from label_clean."""
    conn = op.get_bind()
    conn.execute(text("DELETE FROM transaction_clusters WHERE source = 'label_clean'"))
