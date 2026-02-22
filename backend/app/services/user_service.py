"""User account management: change password, delete account."""

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.account import Account
from app.models.category import Category
from app.models.classification_proposal import ClassificationProposal
from app.models.classification_rule import ClassificationRule
from app.models.conversation import Conversation
from app.models.transaction import ImportLog, Transaction
from app.models.transaction_cluster import TransactionCluster
from app.models.user import User


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def change_password(self, user: User, current_password: str, new_password: str) -> None:
        """Change user password. Verifies current password."""
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mot de passe actuel incorrect",
            )
        user.password_hash = hash_password(new_password)
        await self.db.flush()

    async def delete_account(self, user: User, confirmation: str) -> None:
        """Permanently delete user and all associated data. Requires confirmation string."""
        if confirmation != "SUPPRIMER":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Confirmation incorrecte. Tapez SUPPRIMER pour confirmer.",
            )

        user_id = user.id

        # Get user's account IDs
        result = await self.db.execute(select(Account.id).where(Account.user_id == user_id))
        account_ids = [r[0] for r in result.all()]

        # 1. Unlink transactions from clusters, then delete transactions
        if account_ids:
            await self.db.execute(
                update(Transaction)
                .where(Transaction.account_id.in_(account_ids))
                .values(cluster_id=None)
            )
            await self.db.execute(delete(Transaction).where(Transaction.account_id.in_(account_ids)))

        # 2. Delete transaction clusters
        await self.db.execute(delete(TransactionCluster).where(TransactionCluster.user_id == user_id))

        # 3. Delete classification rules
        await self.db.execute(delete(ClassificationRule).where(ClassificationRule.user_id == user_id))

        # 4. Delete classification proposals
        await self.db.execute(
            delete(ClassificationProposal).where(ClassificationProposal.user_id == user_id)
        )

        # 5. Delete import logs
        await self.db.execute(delete(ImportLog).where(ImportLog.user_id == user_id))

        # 6. Delete accounts
        await self.db.execute(delete(Account).where(Account.user_id == user_id))

        # 7. Delete conversations
        await self.db.execute(delete(Conversation).where(Conversation.user_id == user_id))

        # 8. Delete user's categories (user_id is not null)
        await self.db.execute(delete(Category).where(Category.user_id == user_id))

        # 9. Delete user (sessions cascade via FK)
        await self.db.execute(delete(User).where(User.id == user_id))
        await self.db.flush()
