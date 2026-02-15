"""User model."""

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    preferences: Mapped[dict | None] = mapped_column(JSONB, default=None, nullable=True)

    # Relationships (lazy="select" = default lazy loading, avoids loading
    # related tables that may not exist yet during incremental migrations)
    accounts = relationship("Account", back_populates="user", lazy="select")
    categories = relationship("Category", back_populates="user", lazy="select")
    conversations = relationship("Conversation", back_populates="user", lazy="select")
    classification_proposals = relationship("ClassificationProposal", back_populates="user", lazy="select")
