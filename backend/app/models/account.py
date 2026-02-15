"""Account model."""

from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Account(Base, TimestampMixin):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # courant, epargne, carte, invest
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_number_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    initial_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, archived

    # Balance calibration: user provides a known balance at a specific date
    balance_reference_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    balance_reference_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Relationships
    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", lazy="select")
    classification_proposals = relationship("ClassificationProposal", back_populates="account", lazy="select")
