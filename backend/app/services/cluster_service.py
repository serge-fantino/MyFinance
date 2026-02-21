"""Transaction cluster service.

Manages persistent transaction clusters with computed statistics:
- Amount aggregations (total, avg, min, max, stddev)
- Frequency analysis (avg days between, recurrence pattern)
- Outlier detection (IQR-based)
- Trend detection (linear regression slope)
"""

import math
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal

import structlog
from sqlalchemy import select
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
        """List clusters for a user, optionally filtered by account or category."""
        query = select(TransactionCluster).where(TransactionCluster.user_id == user.id)
        if account_id is not None:
            query = query.where(TransactionCluster.account_id == account_id)
        if category_id is not None:
            query = query.where(TransactionCluster.category_id == category_id)
        query = query.order_by(TransactionCluster.updated_at.desc())

        result = await self.db.execute(query)
        clusters = list(result.scalars().all())
        return [self._cluster_to_dict(c) for c in clusters]

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

        return await self.create_cluster(
            user=user,
            name=cluster_name,
            transaction_ids=pc.transaction_ids or [],
            account_id=None,  # Will be inferred from transactions
            category_id=cat_id,
            source="classification",
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
