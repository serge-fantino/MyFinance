"""Account management API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.account import (
    AccountCreate,
    AccountResponse,
    AccountSummary,
    AccountUpdate,
    CalibrateBalanceRequest,
)
from app.services.account_service import AccountService

router = APIRouter()


@router.get("", response_model=list[AccountResponse])
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all accounts for current user."""
    service = AccountService(db)
    return await service.list_accounts(current_user)


@router.post("", response_model=AccountResponse, status_code=201)
async def create_account(
    data: AccountCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new bank account."""
    service = AccountService(db)
    return await service.create_account(data, current_user)


@router.get("/summary", response_model=AccountSummary)
async def get_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get consolidated account summary."""
    service = AccountService(db)
    return await service.get_summary(current_user)


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific account."""
    service = AccountService(db)
    return await service.get_account(account_id, current_user)


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    data: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an account."""
    service = AccountService(db)
    return await service.update_account(account_id, data, current_user)


@router.post("/{account_id}/calibrate", response_model=AccountResponse)
async def calibrate_balance(
    account_id: int,
    data: CalibrateBalanceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calibrate account balance from a known balance at a specific date."""
    service = AccountService(db)
    return await service.calibrate_balance(account_id, current_user, data.date, data.amount)


@router.delete("/{account_id}", status_code=204)
async def archive_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive an account."""
    service = AccountService(db)
    await service.archive_account(account_id, current_user)
