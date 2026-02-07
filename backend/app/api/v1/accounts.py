"""Account management API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.account import AccountCreate, AccountResponse, AccountSummary, AccountUpdate

router = APIRouter()


@router.get("/", response_model=list[AccountResponse])
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all accounts for current user."""
    # TODO: implement
    raise NotImplementedError


@router.post("/", response_model=AccountResponse, status_code=201)
async def create_account(
    data: AccountCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new bank account."""
    # TODO: implement
    raise NotImplementedError


@router.get("/summary", response_model=AccountSummary)
async def get_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get consolidated account summary."""
    # TODO: implement
    raise NotImplementedError


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific account."""
    # TODO: implement
    raise NotImplementedError


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    data: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an account."""
    # TODO: implement
    raise NotImplementedError


@router.delete("/{account_id}", status_code=204)
async def archive_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive an account."""
    # TODO: implement
    raise NotImplementedError
