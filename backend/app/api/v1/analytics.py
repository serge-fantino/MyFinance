"""Analytics API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.analytics import (
    BalanceHistoryResponse,
    CashflowResponse,
    CategoryBreakdownResponse,
    ForecastResponse,
)

router = APIRouter()


@router.get("/cashflow", response_model=CashflowResponse)
async def get_cashflow(
    months: int = Query(12, ge=1, le=36),
    account_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cashflow data (income vs expenses by month)."""
    # TODO: implement
    raise NotImplementedError


@router.get("/by-category", response_model=CategoryBreakdownResponse)
async def get_by_category(
    date_from: str | None = None,
    date_to: str | None = None,
    account_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get expense breakdown by category."""
    # TODO: implement
    raise NotImplementedError


@router.get("/balance-history", response_model=BalanceHistoryResponse)
async def get_balance_history(
    months: int = Query(12, ge=1, le=36),
    account_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get balance history over time."""
    # TODO: implement
    raise NotImplementedError


@router.get("/forecast", response_model=ForecastResponse)
async def get_forecast(
    months: int = Query(3, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cashflow forecast."""
    # TODO: implement
    raise NotImplementedError
