"""Classification rule engine service.

Manages CRUD operations on rules and applies them to transactions.
"""

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.account import Account
from app.models.category import Category
from app.models.classification_rule import ClassificationRule
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.classification_rule import RuleCreate, RuleUpdate

logger = structlog.get_logger()


class RuleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── CRUD ───────────────────────────────────────────

    async def list_rules(self, user: User) -> list[dict]:
        """List all rules for a user, with category names."""
        result = await self.db.execute(
            select(ClassificationRule)
            .where(ClassificationRule.user_id == user.id)
            .order_by(ClassificationRule.priority.desc(), ClassificationRule.created_at.desc())
        )
        rules = result.scalars().all()

        enriched = []
        for rule in rules:
            cat = await self.db.get(Category, rule.category_id)
            enriched.append({
                "id": rule.id,
                "user_id": rule.user_id,
                "pattern": rule.pattern,
                "match_type": rule.match_type,
                "category_id": rule.category_id,
                "category_name": cat.name if cat else None,
                "custom_label": rule.custom_label,
                "priority": rule.priority,
                "is_active": rule.is_active,
                "created_by": rule.created_by,
                "created_at": rule.created_at,
                "updated_at": rule.updated_at,
            })
        return enriched

    async def create_rule(self, data: RuleCreate, user: User) -> dict:
        """Create a new classification rule."""
        rule = ClassificationRule(
            user_id=user.id,
            pattern=data.pattern,
            match_type=data.match_type,
            category_id=data.category_id,
            custom_label=data.custom_label,
            priority=data.priority,
            is_active=True,
            created_by="manual",
        )
        self.db.add(rule)
        await self.db.flush()
        await self.db.refresh(rule)

        cat = await self.db.get(Category, rule.category_id)
        return {
            "id": rule.id,
            "user_id": rule.user_id,
            "pattern": rule.pattern,
            "match_type": rule.match_type,
            "category_id": rule.category_id,
            "category_name": cat.name if cat else None,
            "custom_label": rule.custom_label,
            "priority": rule.priority,
            "is_active": rule.is_active,
            "created_by": rule.created_by,
            "created_at": rule.created_at,
            "updated_at": rule.updated_at,
        }

    async def update_rule(self, rule_id: int, data: RuleUpdate, user: User) -> dict:
        """Update an existing rule."""
        rule = await self._get_user_rule(rule_id, user)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(rule, key, value)
        await self.db.flush()
        await self.db.refresh(rule)

        cat = await self.db.get(Category, rule.category_id)
        return {
            "id": rule.id,
            "user_id": rule.user_id,
            "pattern": rule.pattern,
            "match_type": rule.match_type,
            "category_id": rule.category_id,
            "category_name": cat.name if cat else None,
            "custom_label": rule.custom_label,
            "priority": rule.priority,
            "is_active": rule.is_active,
            "created_by": rule.created_by,
            "created_at": rule.created_at,
            "updated_at": rule.updated_at,
        }

    async def delete_rule(self, rule_id: int, user: User) -> None:
        """Delete a rule."""
        rule = await self._get_user_rule(rule_id, user)
        await self.db.delete(rule)
        await self.db.flush()

    # ── Rule Engine ────────────────────────────────────

    async def apply_rules(self, user: User, account_id: int | None = None) -> dict:
        """Apply all active rules to uncategorized transactions.

        Returns {applied, total_uncategorized}.
        """
        # Load active rules ordered by priority
        result = await self.db.execute(
            select(ClassificationRule).where(
                ClassificationRule.user_id == user.id,
                ClassificationRule.is_active.is_(True),
            ).order_by(ClassificationRule.priority.desc())
        )
        rules = list(result.scalars().all())

        if not rules:
            return {"applied": 0, "total_uncategorized": 0}

        # Load uncategorized transactions
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        txn_query = select(Transaction).where(
            Transaction.account_id.in_(user_accounts),
            Transaction.category_id.is_(None),
            Transaction.deleted_at.is_(None),
        )
        if account_id:
            txn_query = txn_query.where(Transaction.account_id == account_id)

        result = await self.db.execute(txn_query)
        transactions = list(result.scalars().all())

        total_uncategorized = len(transactions)
        applied = 0

        for txn in transactions:
            for rule in rules:
                if self._matches(txn.label_raw, rule.pattern, rule.match_type):
                    txn.category_id = rule.category_id
                    txn.ai_confidence = "rule"
                    if rule.custom_label:
                        txn.label_clean = rule.custom_label
                    applied += 1
                    break  # first matching rule wins

        await self.db.flush()

        logger.info(
            "rules_applied",
            user_id=user.id,
            rules_count=len(rules),
            applied=applied,
            total_uncategorized=total_uncategorized,
        )

        return {"applied": applied, "total_uncategorized": total_uncategorized}

    async def apply_single_rule(self, rule: ClassificationRule, user: User) -> int:
        """Apply a single rule to all matching uncategorized transactions.

        Returns the number of transactions updated.
        """
        user_accounts = select(Account.id).where(Account.user_id == user.id)

        result = await self.db.execute(
            select(Transaction).where(
                Transaction.account_id.in_(user_accounts),
                Transaction.category_id.is_(None),
                Transaction.deleted_at.is_(None),
            )
        )
        transactions = result.scalars().all()

        count = 0
        for txn in transactions:
            if self._matches(txn.label_raw, rule.pattern, rule.match_type):
                txn.category_id = rule.category_id
                txn.ai_confidence = "rule"
                if rule.custom_label:
                    txn.label_clean = rule.custom_label
                count += 1

        await self.db.flush()
        return count

    async def create_rule_from_transaction(
        self,
        user: User,
        label_raw: str,
        category_id: int,
        custom_label: str | None = None,
    ) -> ClassificationRule:
        """Create a rule from a manual transaction classification.

        Extracts a reasonable pattern from the label and creates a 'contains' rule.
        If a matching rule already exists, updates it instead.
        """
        # Normalize the pattern: use the full label
        pattern = label_raw.strip()

        # Check if a rule with the same pattern already exists
        result = await self.db.execute(
            select(ClassificationRule).where(
                ClassificationRule.user_id == user.id,
                func.lower(ClassificationRule.pattern) == pattern.lower(),
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.category_id = category_id
            if custom_label is not None:
                existing.custom_label = custom_label
            existing.is_active = True
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        rule = ClassificationRule(
            user_id=user.id,
            pattern=pattern,
            match_type="contains",
            category_id=category_id,
            custom_label=custom_label,
            priority=10,  # user-created rules have decent priority
            is_active=True,
            created_by="manual",
        )
        self.db.add(rule)
        await self.db.flush()
        await self.db.refresh(rule)
        return rule

    # ── Helpers ─────────────────────────────────────────

    @staticmethod
    def _matches(label: str, pattern: str, match_type: str) -> bool:
        """Check if a transaction label matches a rule pattern."""
        label_lower = label.lower()
        pattern_lower = pattern.lower()

        if match_type == "exact":
            return label_lower == pattern_lower
        elif match_type == "starts_with":
            return label_lower.startswith(pattern_lower)
        else:  # contains (default)
            return pattern_lower in label_lower

    async def _get_user_rule(self, rule_id: int, user: User) -> ClassificationRule:
        """Fetch a rule and verify ownership."""
        result = await self.db.execute(
            select(ClassificationRule).where(ClassificationRule.id == rule_id)
        )
        rule = result.scalar_one_or_none()
        if not rule:
            raise NotFoundError("ClassificationRule")
        if rule.user_id != user.id:
            raise ForbiddenError()
        return rule
