"""Transaction schemas for request/response validation."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class TransactionCreate(BaseModel):
    account_id: int
    date: date
    value_date: date | None = None
    label_raw: str
    amount: Decimal
    currency: str = "EUR"
    category_id: int | None = None
    notes: str | None = None
    tags: list[str] | None = None


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    subcategory: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    label_clean: str | None = None
    custom_label: str | None = None  # Used when creating a rule (label_clean for matched txns)
    create_rule: bool = True  # If False, only update this transaction; no rule created
    rule_pattern: str | None = None  # When create_rule=True: pattern for the rule (default: label_raw)


class TransactionResponse(BaseModel):
    id: int
    account_id: int
    date: date
    value_date: date | None = None
    label_raw: str
    label_clean: str | None = None
    amount: Decimal
    currency: str
    category_id: int | None = None
    category_name: str | None = None
    subcategory: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    source: str
    ai_confidence: str | None = None
    created_at: datetime
    rule_applied_count: int | None = None  # Only set after a category update

    model_config = {"from_attributes": True}


class TransactionFilter(BaseModel):
    account_id: int | None = None
    date_from: date | None = None
    date_to: date | None = None
    category_id: int | None = None
    amount_min: Decimal | None = None
    amount_max: Decimal | None = None
    search: str | None = None


class PaginatedResponse(BaseModel):
    data: list[TransactionResponse]
    meta: dict  # {total, page, per_page, pages}


class ImportResult(BaseModel):
    total_rows: int
    imported_count: int
    duplicate_count: int
    error_count: int
    errors: list[str] | None = None
    ai_classified: int | None = None


class ClassifyResult(BaseModel):
    """Result of AI classification."""
    classified: int
    failed: int
    skipped: int
    total: int
