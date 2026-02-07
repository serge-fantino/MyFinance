"""Transaction API routes."""

from datetime import date
from decimal import Decimal

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
from app.services.import_service import ImportService
from app.services.transaction_service import TransactionService

router = APIRouter()


@router.get("", response_model=PaginatedResponse)
async def list_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    account_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    amount_min: Decimal | None = None,
    amount_max: Decimal | None = None,
    search: str | None = None,
    sort_by: str = "date",
    sort_order: str = "desc",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List transactions with pagination and filters."""
    service = TransactionService(db)
    return await service.list_transactions(
        user=current_user,
        page=page,
        per_page=per_page,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
        category_id=category_id,
        amount_min=amount_min,
        amount_max=amount_max,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post("", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a transaction manually."""
    service = TransactionService(db)
    return await service.create_transaction(data, current_user)


@router.get("/cashflow")
async def get_cashflow(
    account_id: int | None = None,
    granularity: str = Query("monthly", regex="^(monthly|daily)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cashflow aggregates (monthly bars or daily cumulative line)."""
    service = TransactionService(db)
    return await service.get_cashflow(current_user, account_id, granularity)


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific transaction."""
    service = TransactionService(db)
    return await service.get_transaction(transaction_id, current_user)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a transaction (category, notes, tags)."""
    service = TransactionService(db)
    return await service.update_transaction(transaction_id, data, current_user)


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a transaction."""
    service = TransactionService(db)
    await service.delete_transaction(transaction_id, current_user)


@router.post("/import", response_model=ImportResult)
async def import_transactions(
    account_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import transactions from a file (CSV, Excel, OFX/QFX/XML)."""
    content = await file.read()
    service = ImportService(db)
    return await service.import_file(
        user=current_user,
        account_id=account_id,
        filename=file.filename or "upload",
        content=content,
    )
