"""Transaction cluster model.

A persistent grouping of transactions at the lowest level of classification.
Clusters can be derived from classification proposals, rules, or manual grouping.
Each cluster can be associated with a unique category and provides aggregated
statistics (amount, frequency, variation, recurrence, outliers).
"""

from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TransactionCluster(Base, TimestampMixin):
    """A persistent cluster of similar transactions.

    Represents the lowest-level grouping — finer than categories.
    Can be named, associated with a category, and provides computed statistics.
    """

    __tablename__ = "transaction_clusters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True, index=True)

    # Identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Category association (a cluster maps to exactly one category, or none)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)

    # Origin: how this cluster was created
    source: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="manual"
    )  # "classification", "rule", "manual"
    rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("classification_rules.id", ondelete="SET NULL"), nullable=True
    )
    rule_pattern: Mapped[str | None] = mapped_column(String(500), nullable=True)
    match_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # "contains", "exact", "starts_with", "embedding"

    # Cached transaction IDs (denormalized for quick access)
    transaction_ids: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    transaction_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Aggregated statistics (recomputed on demand)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    total_amount_abs: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    avg_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    min_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    max_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    stddev_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    # Frequency & recurrence
    avg_days_between: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_recurring: Mapped[bool | None] = mapped_column(nullable=True)
    recurrence_pattern: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )  # "monthly", "weekly", "quarterly", "yearly", "irregular"
    first_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # ISO date
    last_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # ISO date

    # Outlier & trend detection (stored as JSON for flexibility)
    statistics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Example structure:
    # {
    #   "outlier_ids": [123, 456],        # transaction IDs flagged as outliers
    #   "trend": "stable" | "increasing" | "decreasing",
    #   "trend_slope": 0.05,              # linear regression slope
    #   "cv": 0.15,                       # coefficient of variation
    #   "last_computed_at": "2026-02-21T..."
    # }

    # Relationships
    user = relationship("User")
    account = relationship("Account")
    category = relationship("Category")
    rule = relationship("ClassificationRule")

    __table_args__ = (
        Index("idx_transaction_clusters_user_account", "user_id", "account_id"),
        Index("idx_transaction_clusters_category", "category_id"),
    )
