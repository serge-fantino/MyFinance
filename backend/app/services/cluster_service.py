"""Transaction cluster service.

Manages persistent transaction clusters with computed statistics:
- Amount aggregations (total, avg, min, max, stddev)
- Frequency analysis (avg days between, recurrence pattern)
- Outlier detection (IQR-based)
- Trend detection (linear regression slope)
"""

import math
import re
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal

import structlog
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.account import Account
from app.models.category import Category
from app.models.classification_rule import ClassificationRule
from app.models.transaction import Transaction
from app.models.transaction_cluster import TransactionCluster
from app.models.user import User

logger = structlog.get_logger()


class ClusterService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── CRUD ──────────────────────────────────────────

    async def list_clusters(
        self,
        user: User,
        account_id: int | None = None,
        category_id: int | None = None,
    ) -> list[dict]:
        """List clusters for a user, optionally filtered by account or category.

        When filtering by category, includes clusters whose category is the selected
        one OR any of its descendants (e.g. "Depenses" includes all subcategories).
        """
        query = select(TransactionCluster).where(TransactionCluster.user_id == user.id)
        if account_id is not None:
            query = query.where(TransactionCluster.account_id == account_id)
        if category_id is not None:
            cat_ids = await self._get_category_ids_with_descendants(user, category_id)
            query = query.where(TransactionCluster.category_id.in_(cat_ids))
        query = query.order_by(TransactionCluster.updated_at.desc())

        result = await self.db.execute(query)
        clusters = list(result.scalars().all())
        return [self._cluster_to_dict(c) for c in clusters]

    async def _get_category_ids_with_descendants(
        self, user: User, category_id: int
    ) -> list[int]:
        """Return [category_id] + all descendant category IDs for hierarchy filtering."""
        result = await self.db.execute(
            select(Category).where(
                or_(
                    Category.is_system.is_(True),
                    Category.user_id == user.id,
                )
            )
        )
        all_cats = list(result.scalars().all())
        cat_by_id = {c.id: c for c in all_cats}
        if category_id not in cat_by_id:
            return [category_id]

        by_parent: dict[int | None, list[Category]] = {}
        for c in all_cats:
            by_parent.setdefault(c.parent_id, []).append(c)

        ids = [category_id]
        stack = [category_id]
        while stack:
            pid = stack.pop()
            for child in by_parent.get(pid, []):
                ids.append(child.id)
                stack.append(child.id)
        return ids

    async def get_cluster(self, user: User, cluster_id: int) -> dict | None:
        """Get a single cluster by ID."""
        cluster = await self._get_user_cluster(user, cluster_id)
        if not cluster:
            return None
        return self._cluster_to_dict(cluster)

    async def create_cluster(
        self,
        user: User,
        name: str,
        transaction_ids: list[int],
        account_id: int | None = None,
        category_id: int | None = None,
        description: str | None = None,
        source: str = "manual",
        proposal_cluster_id: int | None = None,
        rule_id: int | None = None,
        rule_pattern: str | None = None,
        match_type: str | None = None,
    ) -> dict:
        """Create a cluster and compute its statistics."""
        cluster = TransactionCluster(
            user_id=user.id,
            account_id=account_id,
            name=name,
            description=description,
            category_id=category_id,
            source=source,
            proposal_cluster_id=proposal_cluster_id,
            rule_id=rule_id,
            rule_pattern=rule_pattern,
            match_type=match_type,
            transaction_ids=transaction_ids,
            transaction_count=len(transaction_ids),
        )
        self.db.add(cluster)
        await self.db.flush()
        await self.db.refresh(cluster)

        # Compute statistics from actual transactions
        await self._recompute_statistics(cluster, user)
        await self.db.flush()

        logger.info("cluster_created", cluster_id=cluster.id, user_id=user.id, count=len(transaction_ids))
        return self._cluster_to_dict(cluster)

    async def update_cluster(
        self,
        user: User,
        cluster_id: int,
        name: str | None = None,
        description: str | None = None,
        category_id: int | None = ...,  # sentinel: None means "unset category"
        transaction_ids: list[int] | None = None,
        rule_pattern: str | None = None,
        match_type: str | None = None,
    ) -> dict | None:
        """Update a cluster. Recomputes stats if transactions changed."""
        cluster = await self._get_user_cluster(user, cluster_id)
        if not cluster:
            return None

        if name is not None:
            cluster.name = name
        if description is not None:
            cluster.description = description
        if category_id is not ...:
            cluster.category_id = category_id
        if rule_pattern is not None:
            cluster.rule_pattern = rule_pattern or None
        if match_type is not None:
            cluster.match_type = match_type or None

        recompute = False
        if transaction_ids is not None:
            cluster.transaction_ids = transaction_ids
            cluster.transaction_count = len(transaction_ids)
            recompute = True

        await self.db.flush()

        if recompute:
            await self._recompute_statistics(cluster, user)
            await self.db.flush()

        return self._cluster_to_dict(cluster)

    async def delete_cluster(self, user: User, cluster_id: int) -> bool:
        """Delete a cluster."""
        cluster = await self._get_user_cluster(user, cluster_id)
        if not cluster:
            return False
        await self.db.delete(cluster)
        await self.db.flush()
        return True

    async def recompute_cluster_stats(self, user: User, cluster_id: int) -> dict | None:
        """Force recomputation of statistics for a cluster."""
        cluster = await self._get_user_cluster(user, cluster_id)
        if not cluster:
            return None
        await self._recompute_statistics(cluster, user)
        await self.db.flush()
        return self._cluster_to_dict(cluster)

    async def suggest_pattern_for_transactions(
        self, user: User, transaction_ids: list[int]
    ) -> dict | None:
        """Suggest a rule pattern from transaction labels (same logic as classification)."""
        if not transaction_ids:
            return None

        user_accounts = select(Account.id).where(Account.user_id == user.id)
        result = await self.db.execute(
            select(Transaction)
            .where(
                Transaction.id.in_(transaction_ids),
                Transaction.account_id.in_(user_accounts),
                Transaction.deleted_at.is_(None),
            )
        )
        transactions = list(result.scalars().all())
        if not transactions:
            return None

        label_counts: dict[str, int] = {}
        for txn in transactions:
            counterparty = (
                txn.parsed_metadata.get("counterparty")
                if txn.parsed_metadata
                else None
            )
            display_label = (counterparty or txn.label_raw).strip()
            if display_label:
                label_counts[display_label] = label_counts.get(display_label, 0) + 1

        if not label_counts:
            return {"suggested_pattern": transactions[0].label_raw or "", "match_type": "contains"}

        suggested = max(label_counts, key=label_counts.get)
        return {"suggested_pattern": suggested, "match_type": "contains"}

    _RECURRENCE_LABELS = {
        "daily": "Quotidien",
        "weekly": "Hebdomadaire",
        "biweekly": "Bi-hebdo",
        "monthly": "Mensuel",
        "quarterly": "Trimestriel",
        "biannual": "Semestriel",
        "yearly": "Annuel",
        "irregular": "Irrégulier",
    }

    async def suggest_cluster_name(
        self, user: User, transaction_ids: list[int]
    ) -> dict | None:
        """Suggest a cluster name from transactions (representative label + recurrence)."""
        if not transaction_ids:
            return None

        user_accounts = select(Account.id).where(Account.user_id == user.id)
        result = await self.db.execute(
            select(Transaction)
            .where(
                Transaction.id.in_(transaction_ids),
                Transaction.account_id.in_(user_accounts),
                Transaction.deleted_at.is_(None),
            )
            .order_by(Transaction.date)
        )
        transactions = list(result.scalars().all())
        if not transactions:
            return None

        # Representative label (most frequent counterparty or label_raw)
        label_counts: dict[str, int] = {}
        for txn in transactions:
            counterparty = (
                txn.parsed_metadata.get("counterparty")
                if txn.parsed_metadata
                else None
            )
            display_label = (counterparty or txn.label_raw).strip()
            if display_label:
                label_counts[display_label] = label_counts.get(display_label, 0) + 1
        base_name = max(label_counts, key=label_counts.get) if label_counts else transactions[0].label_raw or "Cluster"

        # Recurrence from dates
        dates = sorted([t.date for t in transactions])
        recurrence_part: str | None = None
        if len(dates) >= 2:
            gaps = [
                (dates[i + 1] - dates[i]).days
                for i in range(len(dates) - 1)
            ]
            avg_gap = sum(gaps) / len(gaps)
            pattern, is_recurring = self._detect_recurrence(gaps, avg_gap)
            if pattern:
                recurrence_part = self._RECURRENCE_LABELS.get(pattern, pattern)

        if recurrence_part:
            suggested_name = f"{base_name} — {recurrence_part}"
        else:
            suggested_name = base_name

        return {"suggested_name": suggested_name}

    @staticmethod
    def _matches(label: str, pattern: str, match_type: str) -> bool:
        """Check if a label matches a pattern (same logic as RuleService).

        match_type: exact, starts_with, regex, or contains (with " % " for multiple).
        """
        label_lower = label.lower()
        pattern_stripped = pattern.strip()

        if match_type == "regex":
            try:
                return bool(re.search(pattern_stripped, label, re.IGNORECASE))
            except re.error:
                return False

        if match_type == "exact":
            return label_lower == pattern_stripped.lower()
        if match_type == "starts_with":
            return label_lower.startswith(pattern_stripped.lower())

        # contains — support "A % B" for multiple (all must be in label)
        if " % " in pattern_stripped:
            parts = [p.strip() for p in pattern_stripped.split("%") if p.strip()]
            return all(p.lower() in label_lower for p in parts)
        return pattern_stripped.lower() in label_lower

    async def validate_pattern(
        self, user: User, transaction_ids: list[int], rule_pattern: str, match_type: str = "contains"
    ) -> dict:
        """Validate that a pattern matches the selected transactions. Returns match_count, total, details."""
        if not rule_pattern.strip():
            return {"match_count": 0, "total": len(transaction_ids), "matched_ids": [], "unmatched": []}

        user_accounts = select(Account.id).where(Account.user_id == user.id)
        result = await self.db.execute(
            select(Transaction)
            .where(
                Transaction.id.in_(transaction_ids),
                Transaction.account_id.in_(user_accounts),
                Transaction.deleted_at.is_(None),
            )
        )
        transactions = list(result.scalars().all())

        matched_ids = []
        unmatched = []
        for txn in transactions:
            if self._matches(txn.label_raw, rule_pattern, match_type):
                matched_ids.append(txn.id)
            else:
                unmatched.append({"id": txn.id, "label_raw": txn.label_raw})

        return {
            "match_count": len(matched_ids),
            "total": len(transactions),
            "matched_ids": matched_ids,
            "unmatched": unmatched,
        }

    async def get_cluster_transactions(self, user: User, cluster_id: int) -> list[dict]:
        """Get the full list of transactions for a cluster."""
        cluster = await self._get_user_cluster(user, cluster_id)
        if not cluster:
            return []

        txn_ids = cluster.transaction_ids or []
        if not txn_ids:
            return []

        user_accounts = select(Account.id).where(Account.user_id == user.id)
        result = await self.db.execute(
            select(Transaction)
            .where(
                Transaction.id.in_(txn_ids),
                Transaction.account_id.in_(user_accounts),
                Transaction.deleted_at.is_(None),
            )
            .order_by(Transaction.date.desc())
        )
        transactions = list(result.scalars().all())
        return [
            {
                "id": t.id,
                "date": t.date.isoformat(),
                "label_raw": t.label_raw,
                "label_clean": t.label_clean,
                "amount": float(t.amount),
                "category_id": t.category_id,
            }
            for t in transactions
        ]

    async def move_transactions(
        self,
        user: User,
        target_cluster_id: int,
        transaction_ids: list[int],
        from_cluster_id: int,
    ) -> dict | None:
        """Move transactions from one cluster to another. Recomputes both clusters."""
        if from_cluster_id == target_cluster_id:
            target = await self._get_user_cluster(user, target_cluster_id)
            return self._cluster_to_dict(target) if target else None

        source = await self._get_user_cluster(user, from_cluster_id)
        target = await self._get_user_cluster(user, target_cluster_id)
        if not source or not target:
            return None

        txn_ids = set(transaction_ids)
        source_ids = set(source.transaction_ids or [])
        if not txn_ids.issubset(source_ids):
            raise ValueError("Some transactions are not in the source cluster")

        new_source_ids = [x for x in (source.transaction_ids or []) if x not in txn_ids]
        new_target_ids = list((target.transaction_ids or [])) + list(txn_ids)

        source.transaction_ids = new_source_ids
        source.transaction_count = len(new_source_ids)
        target.transaction_ids = new_target_ids
        target.transaction_count = len(new_target_ids)

        await self.db.flush()

        await self._recompute_statistics(source, user)
        await self._recompute_statistics(target, user)
        await self.db.flush()

        logger.info(
            "transactions_moved",
            from_cluster=from_cluster_id,
            to_cluster=target_cluster_id,
            count=len(txn_ids),
        )
        return self._cluster_to_dict(target)

    async def create_cluster_from_selection(
        self,
        user: User,
        transaction_ids: list[int],
        name: str,
        category_id: int | None = None,
        description: str | None = None,
        rule_pattern: str | None = None,
        match_type: str | None = "contains",
        create_rule: bool = False,
    ) -> dict:
        """Create a new cluster from selected transactions, removing them from source clusters."""
        if not transaction_ids:
            raise ValueError("Aucune transaction sélectionnée")

        txn_set = set(transaction_ids)

        # Find clusters that contain any of these transactions
        result = await self.db.execute(
            select(TransactionCluster).where(TransactionCluster.user_id == user.id)
        )
        all_clusters = result.scalars().all()
        source_clusters = [c for c in all_clusters if c.transaction_ids and set(c.transaction_ids) & txn_set]

        # Get account_id from first source cluster or from a transaction
        account_id: int | None = None
        if source_clusters:
            account_id = source_clusters[0].account_id
        if not account_id:
            user_accounts = select(Account.id).where(Account.user_id == user.id)
            txn_result = await self.db.execute(
                select(Transaction)
                .where(
                    Transaction.id == transaction_ids[0],
                    Transaction.account_id.in_(user_accounts),
                )
            )
            txn = txn_result.scalar_one_or_none()
            if txn:
                account_id = txn.account_id

        rule_id: int | None = None
        if create_rule and rule_pattern and category_id:
            from app.models.classification_rule import ClassificationRule

            rule = ClassificationRule(
                user_id=user.id,
                pattern=rule_pattern,
                match_type=match_type or "contains",
                category_id=category_id,
                is_active=True,
                created_by="manual",
            )
            self.db.add(rule)
            await self.db.flush()
            await self.db.refresh(rule)
            rule_id = rule.id

        # Remove transactions from source clusters
        for cluster in source_clusters:
            new_ids = [x for x in (cluster.transaction_ids or []) if x not in txn_set]
            cluster.transaction_ids = new_ids
            cluster.transaction_count = len(new_ids)

        await self.db.flush()

        # Create new cluster
        cluster = TransactionCluster(
            user_id=user.id,
            account_id=account_id,
            name=name,
            description=description,
            category_id=category_id,
            source="manual",
            rule_id=rule_id,
            rule_pattern=rule_pattern,
            match_type=match_type or "contains",
            transaction_ids=transaction_ids,
            transaction_count=len(transaction_ids),
        )
        self.db.add(cluster)
        await self.db.flush()
        await self.db.refresh(cluster)

        await self._recompute_statistics(cluster, user)
        for c in source_clusters:
            await self._recompute_statistics(c, user)
        await self.db.flush()

        logger.info(
            "cluster_created_from_selection",
            cluster_id=cluster.id,
            user_id=user.id,
            count=len(transaction_ids),
            create_rule=create_rule,
        )
        return self._cluster_to_dict(cluster)

    # ── Bulk creation from classification proposals ───

    async def create_from_proposal_cluster(
        self,
        user: User,
        proposal_cluster_id: int,
        name: str | None = None,
        category_id: int | None = None,
    ) -> dict:
        """Create a persistent TransactionCluster from a ClassificationProposalCluster."""
        from app.models.classification_proposal import (
            ClassificationProposal,
            ClassificationProposalCluster,
        )

        result = await self.db.execute(
            select(ClassificationProposalCluster)
            .join(ClassificationProposal)
            .where(
                ClassificationProposalCluster.id == proposal_cluster_id,
                ClassificationProposal.user_id == user.id,
            )
        )
        pc = result.scalar_one_or_none()
        if not pc:
            raise ValueError("Proposal cluster not found")

        cluster_name = name or pc.custom_label or pc.representative_label
        cat_id = category_id or pc.override_category_id or pc.suggested_category_id
        txn_ids = pc.transaction_ids or []
        excluded = set(pc.excluded_ids or [])
        if excluded:
            txn_ids = [x for x in txn_ids if x not in excluded]

        return await self.create_cluster(
            user=user,
            name=cluster_name,
            transaction_ids=txn_ids,
            account_id=None,  # Will be inferred from transactions
            category_id=cat_id,
            source="classification",
            proposal_cluster_id=proposal_cluster_id,
            rule_pattern=pc.rule_pattern,
            match_type="embedding",
        )

    # ── Statistics computation ────────────────────────

    async def _recompute_statistics(
        self, cluster: TransactionCluster, user: User
    ) -> None:
        """Compute all statistics for a cluster from its transactions."""
        txn_ids = cluster.transaction_ids or []
        if not txn_ids:
            self._reset_statistics(cluster)
            return

        user_accounts = select(Account.id).where(Account.user_id == user.id)
        result = await self.db.execute(
            select(Transaction)
            .where(
                Transaction.id.in_(txn_ids),
                Transaction.account_id.in_(user_accounts),
                Transaction.deleted_at.is_(None),
            )
            .order_by(Transaction.date)
        )
        transactions = list(result.scalars().all())

        if not transactions:
            self._reset_statistics(cluster)
            return

        # Infer account_id if not set
        if not cluster.account_id:
            account_ids = {t.account_id for t in transactions}
            if len(account_ids) == 1:
                cluster.account_id = account_ids.pop()

        amounts = [float(t.amount) for t in transactions]
        abs_amounts = [abs(a) for a in amounts]
        dates = sorted([t.date for t in transactions])

        # Amount aggregations
        cluster.transaction_count = len(transactions)
        cluster.total_amount = Decimal(str(round(sum(amounts), 2)))
        cluster.total_amount_abs = Decimal(str(round(sum(abs_amounts), 2)))
        cluster.avg_amount = Decimal(str(round(sum(amounts) / len(amounts), 2)))
        cluster.min_amount = Decimal(str(round(min(amounts), 2)))
        cluster.max_amount = Decimal(str(round(max(amounts), 2)))

        if len(amounts) > 1:
            mean = sum(amounts) / len(amounts)
            variance = sum((a - mean) ** 2 for a in amounts) / (len(amounts) - 1)
            cluster.stddev_amount = Decimal(str(round(math.sqrt(variance), 2)))
        else:
            cluster.stddev_amount = Decimal("0")

        # Date range
        cluster.first_date = dates[0].isoformat()
        cluster.last_date = dates[-1].isoformat()

        # Frequency analysis
        if len(dates) > 1:
            gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
            avg_gap = sum(gaps) / len(gaps)
            cluster.avg_days_between = Decimal(str(round(avg_gap, 2)))

            # Recurrence detection
            cluster.recurrence_pattern, cluster.is_recurring = self._detect_recurrence(gaps, avg_gap)
        else:
            cluster.avg_days_between = None
            cluster.is_recurring = False
            cluster.recurrence_pattern = None

        # Advanced statistics (outliers, trend)
        stats = {}

        # Outlier detection (IQR method)
        if len(abs_amounts) >= 4:
            sorted_amounts = sorted(abs_amounts)
            q1_idx = len(sorted_amounts) // 4
            q3_idx = 3 * len(sorted_amounts) // 4
            q1 = sorted_amounts[q1_idx]
            q3 = sorted_amounts[q3_idx]
            iqr = q3 - q1
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr
            outlier_ids = [
                t.id for t, a in zip(transactions, abs_amounts)
                if a < lower_bound or a > upper_bound
            ]
            stats["outlier_ids"] = outlier_ids
            stats["outlier_count"] = len(outlier_ids)

        # Coefficient of variation
        if cluster.avg_amount and float(cluster.avg_amount) != 0 and cluster.stddev_amount:
            cv = abs(float(cluster.stddev_amount) / float(cluster.avg_amount))
            stats["cv"] = round(cv, 4)

        # Trend detection (linear regression on amounts over time)
        if len(amounts) >= 3:
            trend, slope = self._detect_trend(dates, amounts)
            stats["trend"] = trend
            stats["trend_slope"] = round(slope, 6)

        cluster.statistics = stats if stats else None

    @staticmethod
    def _detect_recurrence(gaps: list[int], avg_gap: float) -> tuple[str | None, bool]:
        """Detect recurrence pattern from inter-transaction gaps."""
        if not gaps:
            return (None, False)

        # Tolerance: 30% of average gap (min 2 days)
        tolerance = max(2, avg_gap * 0.3)
        consistent = all(abs(g - avg_gap) <= tolerance for g in gaps)

        if not consistent:
            # Check if most gaps are consistent (>= 70%)
            consistent_count = sum(1 for g in gaps if abs(g - avg_gap) <= tolerance)
            consistent = consistent_count / len(gaps) >= 0.7

        if not consistent:
            return ("irregular", False)

        # Classify by average gap
        if 1 <= avg_gap <= 2:
            return ("daily", True)
        elif 5 <= avg_gap <= 9:
            return ("weekly", True)
        elif 12 <= avg_gap <= 18:
            return ("biweekly", True)
        elif 25 <= avg_gap <= 35:
            return ("monthly", True)
        elif 55 <= avg_gap <= 95:
            return ("quarterly", True)
        elif 160 <= avg_gap <= 200:
            return ("biannual", True)
        elif 330 <= avg_gap <= 400:
            return ("yearly", True)
        else:
            return ("irregular", True)

    @staticmethod
    def _detect_trend(dates: list[date], amounts: list[float]) -> tuple[str, float]:
        """Simple linear regression to detect trend direction."""
        n = len(amounts)
        if n < 2:
            return ("stable", 0.0)

        # Use ordinal day numbers for x-axis
        base = dates[0].toordinal()
        x = [d.toordinal() - base for d in dates]
        y = amounts

        mean_x = sum(x) / n
        mean_y = sum(y) / n

        numerator = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
        denominator = sum((xi - mean_x) ** 2 for xi in x)

        if denominator == 0:
            return ("stable", 0.0)

        slope = numerator / denominator

        # Normalize slope relative to mean amount
        if mean_y != 0:
            relative_slope = slope / abs(mean_y) * 30  # per month
        else:
            relative_slope = 0.0

        if relative_slope > 0.05:
            return ("increasing", slope)
        elif relative_slope < -0.05:
            return ("decreasing", slope)
        else:
            return ("stable", slope)

    @staticmethod
    def _reset_statistics(cluster: TransactionCluster) -> None:
        """Reset all computed statistics to None/zero."""
        cluster.transaction_count = 0
        cluster.total_amount = None
        cluster.total_amount_abs = None
        cluster.avg_amount = None
        cluster.min_amount = None
        cluster.max_amount = None
        cluster.stddev_amount = None
        cluster.avg_days_between = None
        cluster.is_recurring = None
        cluster.recurrence_pattern = None
        cluster.first_date = None
        cluster.last_date = None
        cluster.statistics = None

    # ── Helpers ───────────────────────────────────────

    async def _get_user_cluster(self, user: User, cluster_id: int) -> TransactionCluster | None:
        """Fetch a cluster and verify ownership."""
        result = await self.db.execute(
            select(TransactionCluster).where(
                TransactionCluster.id == cluster_id,
                TransactionCluster.user_id == user.id,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _cluster_to_dict(cluster: TransactionCluster) -> dict:
        """Convert cluster model to API response dict."""
        return {
            "id": cluster.id,
            "user_id": cluster.user_id,
            "account_id": cluster.account_id,
            "name": cluster.name,
            "description": cluster.description,
            "category_id": cluster.category_id,
            "source": cluster.source,
            "proposal_cluster_id": cluster.proposal_cluster_id,
            "rule_id": cluster.rule_id,
            "rule_pattern": cluster.rule_pattern,
            "match_type": cluster.match_type,
            "transaction_ids": cluster.transaction_ids or [],
            "transaction_count": cluster.transaction_count,
            "total_amount": float(cluster.total_amount) if cluster.total_amount is not None else None,
            "total_amount_abs": float(cluster.total_amount_abs) if cluster.total_amount_abs is not None else None,
            "avg_amount": float(cluster.avg_amount) if cluster.avg_amount is not None else None,
            "min_amount": float(cluster.min_amount) if cluster.min_amount is not None else None,
            "max_amount": float(cluster.max_amount) if cluster.max_amount is not None else None,
            "stddev_amount": float(cluster.stddev_amount) if cluster.stddev_amount is not None else None,
            "avg_days_between": float(cluster.avg_days_between) if cluster.avg_days_between is not None else None,
            "is_recurring": cluster.is_recurring,
            "recurrence_pattern": cluster.recurrence_pattern,
            "first_date": cluster.first_date,
            "last_date": cluster.last_date,
            "statistics": cluster.statistics,
        }
