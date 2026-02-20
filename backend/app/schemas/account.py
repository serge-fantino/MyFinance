"""Account schemas for request/response validation."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class AccountCreate(BaseModel):
    name: str
    type: str  # courant, epargne, carte, invest
    currency: str = "EUR"
    bank_name: str | None = None
    bank_id: str | None = None  # OFX BANKID
    branch_id: str | None = None  # OFX BRANCHID
    initial_balance: Decimal = Decimal("0.00")
    color: str | None = None


class AccountUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    currency: str | None = None
    bank_name: str | None = None
    bank_id: str | None = None
    branch_id: str | None = None
    color: str | None = None
    status: str | None = None


class CalibrateBalanceRequest(BaseModel):
    """User provides a known balance at a specific date to calibrate the account."""
    date: date
    amount: Decimal


class AccountResponse(BaseModel):
    id: int
    name: str
    type: str
    currency: str
    bank_name: str | None
    bank_id: str | None = None
    branch_id: str | None = None
    initial_balance: Decimal
    color: str | None
    status: str
    current_balance: Decimal | None = None
    balance_reference_date: date | None = None
    balance_reference_amount: Decimal | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AccountSummary(BaseModel):
    total_balance: Decimal
    total_accounts: int
    accounts: list[AccountResponse]
