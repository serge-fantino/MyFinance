"""Classification rule model."""

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ClassificationRule(Base, TimestampMixin):
    """A rule that automatically classifies transactions matching a pattern.

    When a transaction's label_raw matches the pattern (according to match_type),
    the rule assigns the category and optionally sets a custom clean label.
    """

    __tablename__ = "classification_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    pattern: Mapped[str] = mapped_column(String(500), nullable=False)
    match_type: Mapped[str] = mapped_column(
        String(20), default="contains"
    )  # contains, exact, starts_with
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    custom_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)  # higher = checked first
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(
        String(20), default="manual"
    )  # manual, ai

    # Relationships
    user = relationship("User")
    category = relationship("Category")
