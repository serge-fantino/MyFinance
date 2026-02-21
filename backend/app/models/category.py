"""Category model."""

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Category(Base, TimestampMixin):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    # Hierarchy navigation fields
    level: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    level1_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    level2_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)

    # Relationships
    user = relationship("User", back_populates="categories")
    parent = relationship("Category", remote_side="Category.id", foreign_keys=[parent_id], backref="children")
    level1_category = relationship("Category", remote_side="Category.id", foreign_keys=[level1_id])
    level2_category = relationship("Category", remote_side="Category.id", foreign_keys=[level2_id])
    transactions = relationship("Transaction", back_populates="category")
