"""Analytics service — category breakdowns, etc."""

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _base_filters(
        self,
        user_accounts,
        account_id: int | None,
        date_from: date | None,
        date_to: date | None,
        direction: str | None,
    ):
        """Return a list of WHERE clauses (reusable)."""
        clauses = [
            Transaction.account_id.in_(user_accounts),
            Transaction.deleted_at.is_(None),
        ]
        if account_id:
            clauses.append(Transaction.account_id == account_id)
        if date_from:
            clauses.append(Transaction.date >= date_from)
        if date_to:
            clauses.append(Transaction.date <= date_to)
        if direction == "income":
            clauses.append(Transaction.amount > 0)
        elif direction == "expense":
            clauses.append(Transaction.amount < 0)
        return clauses

    async def by_category(
        self,
        user: User,
        account_id: int | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        direction: str | None = None,
    ) -> list[dict]:
        """Compute totals grouped by category, including uncategorized."""
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        base_clauses = self._base_filters(user_accounts, account_id, date_from, date_to, direction)

        # Categorized transactions
        cat_query = (
            select(
                Transaction.category_id,
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("count"),
            )
            .where(*base_clauses, Transaction.category_id.is_not(None))
            .group_by(Transaction.category_id)
        )
        result = await self.db.execute(cat_query)
        rows = list(result.all())

        # Uncategorized transactions
        uncat_query = (
            select(
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("count"),
            )
            .where(*base_clauses, Transaction.category_id.is_(None))
        )
        uncat_result = await self.db.execute(uncat_query)
        uncat_row = uncat_result.one()

        # Grand total includes uncategorized
        grand_total = sum(abs(float(r.total)) for r in rows)
        if uncat_row.total:
            grand_total += abs(float(uncat_row.total))

        if grand_total == 0:
            return []

        # Enrich categorized entries
        entries = []
        for row in rows:
            cat = await self.db.get(Category, row.category_id)
            parent_name = None
            parent_id = None
            if cat and cat.parent_id:
                parent = await self.db.get(Category, cat.parent_id)
                parent_name = parent.name if parent else None
                parent_id = cat.parent_id

            entries.append({
                "category_id": row.category_id,
                "category_name": cat.name if cat else "?",
                "parent_id": parent_id,
                "parent_name": parent_name,
                "total": float(row.total),
                "count": row.count,
                "percentage": round(abs(float(row.total)) / grand_total * 100, 1),
            })

        # Add uncategorized if any
        if uncat_row.count and uncat_row.count > 0:
            entries.append({
                "category_id": None,
                "category_name": "Non classé",
                "parent_id": None,
                "parent_name": None,
                "total": float(uncat_row.total),
                "count": uncat_row.count,
                "percentage": round(abs(float(uncat_row.total)) / grand_total * 100, 1),
            })

        entries.sort(key=lambda e: abs(e["total"]), reverse=True)
        return entries

    async def category_detail(
        self,
        user: User,
        category_id: int | None,
        account_id: int | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        direction: str | None = None,
    ) -> list[dict]:
        """Get transactions for a category, grouped by effective label.

        Effective label = label_clean when set (non-empty), else label_raw.
        This groups transactions with the same custom label (e.g. "Salaire Serge")
        even when raw labels differ.
        """
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        base_clauses = self._base_filters(user_accounts, account_id, date_from, date_to, direction)

        if category_id is not None:
            base_clauses.append(Transaction.category_id == category_id)
        else:
            base_clauses.append(Transaction.category_id.is_(None))

        # Effective label: prefer label_clean when set, else label_raw
        effective_label = func.coalesce(
            func.nullif(func.trim(Transaction.label_clean), ""),
            Transaction.label_raw,
        )

        group_query = (
            select(
                effective_label.label("effective_label"),
                func.sum(Transaction.amount).label("total"),
                func.count(Transaction.id).label("count"),
            )
            .where(*base_clauses)
            .group_by(effective_label)
            .order_by(func.abs(func.sum(Transaction.amount)).desc())
        )
        result = await self.db.execute(group_query)
        groups = result.all()

        entries = []
        for grp in groups:
            # Fetch transactions where effective label equals this group's key
            txn_filter = (
                func.coalesce(
                    func.nullif(func.trim(Transaction.label_clean), ""),
                    Transaction.label_raw,
                )
                == grp.effective_label
            )
            txn_query = (
                select(Transaction)
                .where(*base_clauses, txn_filter)
                .order_by(Transaction.date.desc())
                .limit(50)
            )
            txn_result = await self.db.execute(txn_query)
            txns = txn_result.scalars().all()

            entries.append({
                "label": grp.effective_label or "",
                "total": float(grp.total),
                "count": grp.count,
                "transactions": [
                    {
                        "id": t.id,
                        "date": t.date.isoformat(),
                        "label_raw": t.label_raw,
                        "label_clean": t.label_clean,
                        "amount": float(t.amount),
                        "currency": t.currency,
                        "category_id": t.category_id,
                        "ai_confidence": t.ai_confidence,
                    }
                    for t in txns
                ],
            })

        return entries
