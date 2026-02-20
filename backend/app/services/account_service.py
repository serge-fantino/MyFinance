"""Account management service."""

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.account import Account
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.account import AccountCreate, AccountSummary, AccountUpdate


class AccountService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_accounts(self, user: User) -> list[dict]:
        """List all accounts for a user with calculated current balance."""
        result = await self.db.execute(
            select(Account)
            .where(Account.user_id == user.id, Account.status == "active")
            .order_by(Account.created_at)
        )
        accounts = result.scalars().all()

        enriched = []
        for acc in accounts:
            balance = await self._calculate_balance(acc)
            data = {
                "id": acc.id,
                "name": acc.name,
                "type": acc.type,
                "currency": acc.currency,
                "bank_name": acc.bank_name,
                "bank_id": getattr(acc, "bank_id", None),
                "branch_id": getattr(acc, "branch_id", None),
                "initial_balance": acc.initial_balance,
                "color": acc.color,
                "status": acc.status,
                "current_balance": balance,
                "balance_reference_date": acc.balance_reference_date,
                "balance_reference_amount": acc.balance_reference_amount,
                "created_at": acc.created_at,
            }
            enriched.append(data)
        return enriched

    async def create_account(self, data: AccountCreate, user: User) -> Account:
        """Create a new bank account."""
        account = Account(
            user_id=user.id,
            name=data.name,
            type=data.type,
            currency=data.currency,
            bank_name=data.bank_name,
            bank_id=data.bank_id,
            branch_id=data.branch_id,
            initial_balance=data.initial_balance,
            color=data.color,
        )
        self.db.add(account)
        await self.db.flush()
        await self.db.refresh(account)
        return account

    async def get_account(self, account_id: int, user: User) -> Account:
        """Get a specific account, ensuring it belongs to the user."""
        account = await self._get_user_account(account_id, user)
        return account

    async def update_account(self, account_id: int, data: AccountUpdate, user: User) -> Account:
        """Update an account."""
        account = await self._get_user_account(account_id, user)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(account, key, value)
        await self.db.flush()
        await self.db.refresh(account)
        return account

    async def archive_account(self, account_id: int, user: User) -> None:
        """Archive (soft-delete) an account."""
        account = await self._get_user_account(account_id, user)
        account.status = "archived"
        await self.db.flush()

    async def get_summary(self, user: User) -> AccountSummary:
        """Get consolidated account summary."""
        accounts_data = await self.list_accounts(user)
        total = sum(a["current_balance"] for a in accounts_data)
        return AccountSummary(
            total_balance=total,
            total_accounts=len(accounts_data),
            accounts=accounts_data,
        )

    async def calibrate_balance(
        self, account_id: int, user: User, ref_date: date, ref_amount: Decimal
    ) -> dict:
        """Calibrate account balance from a known balance at a given date.

        Computes: initial_balance = ref_amount - sum(transactions up to ref_date)
        """
        account = await self._get_user_account(account_id, user)

        # Sum all transactions up to (and including) the reference date
        result = await self.db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.account_id == account_id,
                Transaction.date <= ref_date,
                Transaction.deleted_at.is_(None),
            )
        )
        txn_sum = result.scalar() or Decimal("0.00")

        # Back-calculate the initial balance
        account.initial_balance = ref_amount - txn_sum
        account.balance_reference_date = ref_date
        account.balance_reference_amount = ref_amount
        await self.db.flush()
        await self.db.refresh(account)

        # Return enriched response
        current_balance = await self._calculate_balance(account)
        return {
            "id": account.id,
            "name": account.name,
            "type": account.type,
            "currency": account.currency,
            "bank_name": account.bank_name,
            "initial_balance": account.initial_balance,
            "color": account.color,
            "status": account.status,
            "current_balance": current_balance,
            "balance_reference_date": account.balance_reference_date,
            "balance_reference_amount": account.balance_reference_amount,
            "created_at": account.created_at,
        }

    async def _get_user_account(self, account_id: int, user: User) -> Account:
        """Fetch account and verify ownership."""
        result = await self.db.execute(
            select(Account).where(Account.id == account_id)
        )
        account = result.scalar_one_or_none()
        if not account:
            raise NotFoundError("Account")
        if account.user_id != user.id:
            raise ForbiddenError()
        return account

    async def _calculate_balance(self, account: Account) -> Decimal:
        """Calculate current balance = initial_balance + sum(transactions)."""
        result = await self.db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .where(
                Transaction.account_id == account.id,
                Transaction.deleted_at.is_(None),
            )
        )
        txn_sum = result.scalar() or Decimal("0.00")
        return account.initial_balance + txn_sum
