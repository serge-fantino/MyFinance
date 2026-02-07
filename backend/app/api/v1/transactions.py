"""Transaction API routes."""

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.transaction import (
    ImportResult,
    PaginatedResponse,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)

router = APIRouter()


@router.get("/", response_model=PaginatedResponse)
async def list_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    account_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    category_id: int | None = None,
    search: str | None = None,
    sort_by: str = "date",
    sort_order: str = "desc",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List transactions with pagination and filters."""
    # TODO: implement
    raise NotImplementedError


@router.post("/", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a transaction manually."""
    # TODO: implement
    raise NotImplementedError


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific transaction."""
    # TODO: implement
    raise NotImplementedError


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a transaction (category, notes, tags)."""
    # TODO: implement
    raise NotImplementedError


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a transaction."""
    # TODO: implement
    raise NotImplementedError


@router.post("/import", response_model=ImportResult)
async def import_transactions(
    account_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import transactions from a file (CSV, Excel, OFX, QIF)."""
    # TODO: implement
    raise NotImplementedError
