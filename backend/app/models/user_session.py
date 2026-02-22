"""User session model for tracking active logins."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class UserSession(Base):
    """Tracks an active login session (refresh token)."""

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device_info: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g. "Chrome 120 sur macOS 14.0 (Ordinateur)"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="sessions")
