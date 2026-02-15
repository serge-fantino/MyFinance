"""Classification proposal models.

One proposal per (user, account). Stores clusters with user state for persistence.
"""

from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ClassificationProposal(Base, TimestampMixin):
    """One classification proposal per (user, account)."""

    __tablename__ = "classification_proposals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False, index=True)
    distance_threshold: Mapped[float] = mapped_column(nullable=False, default=0.22)
    total_uncategorized: Mapped[int] = mapped_column(nullable=False, default=0)
    unclustered_count: Mapped[int] = mapped_column(nullable=False, default=0)

    user = relationship("User", back_populates="classification_proposals")
    account = relationship("Account", back_populates="classification_proposals")
    clusters = relationship(
        "ClassificationProposalCluster",
        back_populates="proposal",
        cascade="all, delete-orphan",
        order_by="ClassificationProposalCluster.cluster_index",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "account_id", name="uq_classification_proposals_user_account"),
        Index("idx_classification_proposals_user_account", "user_id", "account_id"),
    )


class ClassificationProposalCluster(Base):
    """A cluster within a classification proposal, with user state."""

    __tablename__ = "classification_proposal_clusters"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    proposal_id: Mapped[int] = mapped_column(
        ForeignKey("classification_proposals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cluster_index: Mapped[int] = mapped_column(nullable=False)
    representative_label: Mapped[str] = mapped_column(String(500), nullable=False)
    transaction_ids: Mapped[list] = mapped_column(JSONB, nullable=False)
    transactions: Mapped[list] = mapped_column(JSONB, nullable=False)
    transaction_count: Mapped[int] = mapped_column(nullable=False)
    total_amount_abs: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    suggested_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    suggested_category_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suggestion_confidence: Mapped[str | None] = mapped_column(String(20), nullable=True)
    suggestion_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    suggestion_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    override_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    rule_pattern: Mapped[str | None] = mapped_column(String(500), nullable=True)
    custom_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    excluded_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    proposal = relationship("ClassificationProposal", back_populates="clusters")
