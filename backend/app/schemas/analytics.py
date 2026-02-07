"""Analytics schemas."""

from decimal import Decimal

from pydantic import BaseModel


class CashflowItem(BaseModel):
    period: str  # "2026-01", "2026-02", etc.
    income: Decimal
    expenses: Decimal
    net: Decimal


class CashflowResponse(BaseModel):
    data: list[CashflowItem]


class CategoryBreakdown(BaseModel):
    category_id: int | None
    category_name: str
    total: Decimal
    percentage: float
    transaction_count: int


class CategoryBreakdownResponse(BaseModel):
    data: list[CategoryBreakdown]
    period_total: Decimal


class BalancePoint(BaseModel):
    date: str
    balance: Decimal


class BalanceHistoryResponse(BaseModel):
    data: list[BalancePoint]


class ForecastPoint(BaseModel):
    date: str
    predicted: Decimal
    lower_bound: Decimal
    upper_bound: Decimal


class ForecastResponse(BaseModel):
    data: list[ForecastPoint]
