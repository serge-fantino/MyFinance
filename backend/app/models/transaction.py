"""Transaction, ImportLog and ImportRow models."""

from datetime import date
from decimal import Decimal

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Transaction(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    label_raw: Mapped[str] = mapped_column(String(500), nullable=False)
    label_clean: Mapped[str | None] = mapped_column(String(500), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    subcategory: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    dedup_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # import_csv, import_excel, manual
    ai_confidence: Mapped[str | None] = mapped_column(String(10), nullable=True)  # high, medium, low, rule, user, embedding
    parsed_metadata: Mapped[dict | None] = mapped_column(JSONB, default=None, nullable=True)  # structured label metadata
    embedding = mapped_column(Vector(384), nullable=True)  # sentence-transformers embedding
    cluster_id: Mapped[int | None] = mapped_column(
        ForeignKey("transaction_clusters.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    import_log_id: Mapped[int | None] = mapped_column(
        ForeignKey("import_logs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Relationships
    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    cluster = relationship("TransactionCluster", back_populates="transactions", foreign_keys=[cluster_id])
    import_log = relationship("ImportLog", back_populates="transactions", foreign_keys=[import_log_id])

    __table_args__ = (
        Index("idx_transactions_account_date", "account_id", date.desc()),
        Index("idx_transactions_dedup", "dedup_hash", unique=True, postgresql_where="deleted_at IS NULL"),
    )


class ImportLog(Base, TimestampMixin):
    __tablename__ = "import_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    format: Mapped[str] = mapped_column(String(20), nullable=False)  # csv, excel, ofx, qif
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, previewing, confirmed, done, error, cancelled
    total_rows: Mapped[int | None] = mapped_column(default=None, nullable=True)
    imported_count: Mapped[int | None] = mapped_column(default=None, nullable=True)
    duplicate_count: Mapped[int | None] = mapped_column(default=None, nullable=True)
    error_count: Mapped[int | None] = mapped_column(default=None, nullable=True)
    errors_detail: Mapped[dict | None] = mapped_column(JSONB, default=None, nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Relationships
    rows: Mapped[list["ImportRow"]] = relationship("ImportRow", back_populates="import_log", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="import_log", foreign_keys=[Transaction.import_log_id])


class ImportRow(Base, TimestampMixin):
    """Tracks every row from an imported file, regardless of outcome."""
    __tablename__ = "import_rows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    import_log_id: Mapped[int] = mapped_column(ForeignKey("import_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    row_index: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # imported, duplicate_exact, duplicate_fuzzy, rejected, forced
    raw_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    transaction_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    duplicate_of_id: Mapped[int | None] = mapped_column(ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    reject_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    import_log = relationship("ImportLog", back_populates="rows")
    transaction = relationship("Transaction", foreign_keys=[transaction_id])
    duplicate_of = relationship("Transaction", foreign_keys=[duplicate_of_id])
