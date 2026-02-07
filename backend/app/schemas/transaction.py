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


class TransactionResponse(BaseModel):
    id: int
    account_id: int
    date: date
    value_date: date | None
    label_raw: str
    label_clean: str | None
    amount: Decimal
    currency: str
    category_id: int | None
    category_name: str | None = None
    subcategory: str | None
    notes: str | None
    tags: list[str] | None
    source: str
    ai_confidence: str | None
    created_at: datetime

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
