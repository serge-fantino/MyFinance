"""Transaction management service."""

import hashlib
from datetime import date
from decimal import Decimal
from math import ceil

from sqlalchemy import case, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionUpdate


class TransactionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_transactions(
        self,
        user: User,
        page: int = 1,
        per_page: int = 50,
        account_id: int | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        category_id: int | None = None,
        amount_min: Decimal | None = None,
        amount_max: Decimal | None = None,
        search: str | None = None,
        sort_by: str = "date",
        sort_order: str = "desc",
    ) -> dict:
        """List transactions with pagination and filters."""
        # Base query: only user's accounts
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        query = select(Transaction).where(
            Transaction.account_id.in_(user_accounts),
            Transaction.deleted_at.is_(None),
        )

        # Apply filters
        if account_id:
            query = query.where(Transaction.account_id == account_id)
        if date_from:
            query = query.where(Transaction.date >= date_from)
        if date_to:
            query = query.where(Transaction.date <= date_to)
        if category_id:
            query = query.where(Transaction.category_id == category_id)
        if amount_min is not None:
            query = query.where(Transaction.amount >= amount_min)
        if amount_max is not None:
            query = query.where(Transaction.amount <= amount_max)
        if search:
            search_filter = or_(
                Transaction.label_raw.ilike(f"%{search}%"),
                Transaction.label_clean.ilike(f"%{search}%"),
            )
            query = query.where(search_filter)

        # Count total + aggregate income/expenses in one query
        sub = query.subquery()
        agg_query = select(
            func.count().label("total"),
            func.sum(
                case((sub.c.amount > 0, sub.c.amount), else_=Decimal("0"))
            ).label("total_income"),
            func.sum(
                case((sub.c.amount < 0, sub.c.amount), else_=Decimal("0"))
            ).label("total_expenses"),
        ).select_from(sub)
        agg_row = (await self.db.execute(agg_query)).one()
        total = agg_row.total or 0
        total_income = float(agg_row.total_income or 0)
        total_expenses = float(abs(agg_row.total_expenses or 0))

        # Sorting
        sort_column = getattr(Transaction, sort_by, Transaction.date)
        if sort_order == "desc":
            query = query.order_by(sort_column.desc(), Transaction.id.desc())
        else:
            query = query.order_by(sort_column.asc(), Transaction.id.asc())

        # Pagination
        offset = (page - 1) * per_page
        query = query.offset(offset).limit(per_page)

        result = await self.db.execute(query)
        transactions = result.scalars().all()

        # Enrich with category name
        enriched = []
        for txn in transactions:
            data = {
                "id": txn.id,
                "account_id": txn.account_id,
                "date": txn.date,
                "value_date": txn.value_date,
                "label_raw": txn.label_raw,
                "label_clean": txn.label_clean,
                "amount": txn.amount,
                "currency": txn.currency,
                "category_id": txn.category_id,
                "category_name": None,
                "subcategory": txn.subcategory,
                "notes": txn.notes,
                "tags": txn.tags,
                "source": txn.source,
                "ai_confidence": txn.ai_confidence,
                "parsed_metadata": txn.parsed_metadata,
                "created_at": txn.created_at,
            }
            if txn.category_id:
                cat = await self.db.get(Category, txn.category_id)
                if cat:
                    data["category_name"] = cat.name
            enriched.append(data)

        return {
            "data": enriched,
            "meta": {
                "total": total,
                "page": page,
                "per_page": per_page,
                "pages": ceil(total / per_page) if per_page else 0,
                "total_income": total_income,
                "total_expenses": total_expenses,
                "total_net": total_income - total_expenses,
            },
        }

    async def get_cashflow(
        self,
        user: User,
        account_id: int | None = None,
        granularity: str = "monthly",
    ) -> list[dict]:
        """Return cashflow aggregates.

        granularity = "monthly" → one row per month with income/expenses/net
        granularity = "daily"   → one row per day with daily net + cumulative running total
        """
        user_accounts = select(Account.id).where(Account.user_id == user.id)

        base_filter = [
            Transaction.account_id.in_(user_accounts),
            Transaction.deleted_at.is_(None),
        ]
        if account_id:
            base_filter.append(Transaction.account_id == account_id)

        if granularity == "daily":
            # Determine initial_balance to start the cumulative from
            initial_balance = Decimal("0")
            if account_id:
                # Single account: use its initial_balance
                acct = await self.db.get(Account, account_id)
                if acct:
                    initial_balance = acct.initial_balance
            else:
                # All accounts: sum all initial_balances for this user
                result = await self.db.execute(
                    select(func.coalesce(func.sum(Account.initial_balance), 0)).where(
                        Account.user_id == user.id,
                        Account.status == "active",
                    )
                )
                initial_balance = result.scalar() or Decimal("0")
            return await self._cashflow_daily(base_filter, initial_balance)
        return await self._cashflow_monthly(base_filter)

    async def _cashflow_monthly(self, base_filter: list) -> list[dict]:
        month_col = func.date_trunc("month", Transaction.date).label("month")

        query = (
            select(
                month_col,
                func.sum(
                    case((Transaction.amount > 0, Transaction.amount), else_=Decimal("0"))
                ).label("income"),
                func.sum(
                    case((Transaction.amount < 0, Transaction.amount), else_=Decimal("0"))
                ).label("expenses"),
                func.count().label("count"),
            )
            .where(*base_filter)
            .group_by(literal_column("month"))
            .order_by(literal_column("month"))
        )

        result = await self.db.execute(query)
        rows = result.all()

        return [
            {
                "month": row.month.strftime("%Y-%m"),
                "income": float(row.income or 0),
                "expenses": float(abs(row.expenses or 0)),
                "net": float((row.income or 0) + (row.expenses or 0)),
                "count": row.count,
            }
            for row in rows
        ]

    async def _cashflow_daily(
        self, base_filter: list, initial_balance: Decimal = Decimal("0")
    ) -> list[dict]:
        day_col = Transaction.date.label("day")

        query = (
            select(
                day_col,
                func.sum(Transaction.amount).label("net"),
                func.sum(
                    case((Transaction.amount > 0, Transaction.amount), else_=Decimal("0"))
                ).label("income"),
                func.sum(
                    case((Transaction.amount < 0, Transaction.amount), else_=Decimal("0"))
                ).label("expenses"),
                func.count().label("count"),
            )
            .where(*base_filter)
            .group_by(Transaction.date)
            .order_by(Transaction.date)
        )

        result = await self.db.execute(query)
        rows = result.all()

        # Compute running cumulative total starting from the account's initial_balance
        cumulative = initial_balance
        data = []
        for row in rows:
            net = row.net or Decimal("0")
            cumulative += net
            data.append({
                "date": row.day.isoformat(),
                "net": float(net),
                "income": float(row.income or 0),
                "expenses": float(abs(row.expenses or 0)),
                "cumulative": float(cumulative),
                "count": row.count,
            })
        return data

    async def create_transaction(self, data: TransactionCreate, user: User) -> Transaction:
        """Create a transaction manually."""
        await self._verify_account_ownership(data.account_id, user)

        txn = Transaction(
            account_id=data.account_id,
            date=data.date,
            value_date=data.value_date,
            label_raw=data.label_raw,
            amount=data.amount,
            currency=data.currency,
            category_id=data.category_id,
            notes=data.notes,
            tags=data.tags,
            dedup_hash=self._compute_hash(data.date, data.amount, data.label_raw),
            source="manual",
        )
        self.db.add(txn)
        await self.db.flush()
        await self.db.refresh(txn)
        return txn

    async def get_transaction(self, transaction_id: int, user: User) -> Transaction:
        """Get a specific transaction."""
        return await self._get_user_transaction(transaction_id, user)

    async def update_transaction(
        self,
        transaction_id: int,
        data: TransactionUpdate,
        user: User,
    ) -> dict:
        """Update a transaction (category, notes, tags).

        When the user manually sets a category_id, we:
        1. Mark ai_confidence as "user"
        2. Create a classification rule for the label → category mapping
        3. Apply the rule to all other matching uncategorized transactions

        Returns a dict with the updated transaction + count of additionally
        classified transactions (via the new rule).
        """
        from app.services.rule_service import RuleService

        txn = await self._get_user_transaction(transaction_id, user)
        update_data = data.model_dump(exclude_unset=True)

        # Extract fields that are not direct transaction columns
        custom_label = update_data.pop("custom_label", None)
        create_rule = update_data.pop("create_rule", True)
        rule_pattern = update_data.pop("rule_pattern", None)

        rule_applied_count = 0

        # Handle manual category assignment
        if "category_id" in update_data and update_data["category_id"] is not None:
            txn.ai_confidence = "user"

            if create_rule:
                # Create/update a classification rule (pattern = rule_pattern or label_raw)
                rule_service = RuleService(self.db)
                rule = await rule_service.create_rule_from_transaction(
                    user=user,
                    label_raw=txn.label_raw,
                    category_id=update_data["category_id"],
                    custom_label=custom_label,
                    pattern_override=rule_pattern,
                )
                if custom_label:
                    txn.label_clean = custom_label
                rule_applied_count = await rule_service.apply_single_rule(rule, user)
            else:
                # Only update this transaction
                if custom_label:
                    txn.label_clean = custom_label

        for key, value in update_data.items():
            setattr(txn, key, value)
        await self.db.flush()
        await self.db.refresh(txn)

        # Build enriched response
        cat_name = None
        if txn.category_id:
            cat = await self.db.get(Category, txn.category_id)
            if cat:
                cat_name = cat.name

        return {
            "id": txn.id,
            "account_id": txn.account_id,
            "date": txn.date,
            "value_date": txn.value_date,
            "label_raw": txn.label_raw,
            "label_clean": txn.label_clean,
            "amount": txn.amount,
            "currency": txn.currency,
            "category_id": txn.category_id,
            "category_name": cat_name,
            "subcategory": txn.subcategory,
            "notes": txn.notes,
            "tags": txn.tags,
            "source": txn.source,
            "ai_confidence": txn.ai_confidence,
            "parsed_metadata": txn.parsed_metadata,
            "created_at": txn.created_at,
            "rule_applied_count": rule_applied_count,
        }

    async def delete_transaction(self, transaction_id: int, user: User) -> None:
        """Soft-delete a transaction."""
        from datetime import datetime, timezone

        txn = await self._get_user_transaction(transaction_id, user)
        txn.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()

    async def _get_user_transaction(self, transaction_id: int, user: User) -> Transaction:
        """Fetch transaction and verify ownership through account."""
        result = await self.db.execute(
            select(Transaction).where(
                Transaction.id == transaction_id,
                Transaction.deleted_at.is_(None),
            )
        )
        txn = result.scalar_one_or_none()
        if not txn:
            raise NotFoundError("Transaction")

        await self._verify_account_ownership(txn.account_id, user)
        return txn

    async def _verify_account_ownership(self, account_id: int, user: User) -> None:
        """Check that an account belongs to the user."""
        result = await self.db.execute(
            select(Account).where(Account.id == account_id)
        )
        account = result.scalar_one_or_none()
        if not account:
            raise NotFoundError("Account")
        if account.user_id != user.id:
            raise ForbiddenError()

    @staticmethod
    def _compute_hash(txn_date: date, amount: Decimal, label: str) -> str:
        """Compute deduplication hash from date + amount + label."""
        raw = f"{txn_date.isoformat()}|{amount}|{label.strip().lower()}"
        return hashlib.sha256(raw.encode()).hexdigest()
