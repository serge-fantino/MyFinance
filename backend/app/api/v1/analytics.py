"""Analytics API routes — category breakdown, etc."""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.analytics_service import AnalyticsService

router = APIRouter()


@router.get("/by-category")
async def by_category(
    account_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    direction: str | None = Query(None, pattern="^(income|expense)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get amounts broken down by category (including uncategorized).

    Returns a list of { category_id, category_name, parent_name, total, count,
    percentage } entries, ordered by |total| desc.
    """
    service = AnalyticsService(db)
    return await service.by_category(
        user=current_user,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
        direction=direction,
    )


@router.get("/category-detail")
async def category_detail(
    category_id: int | None = None,
    account_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    direction: str | None = Query(None, pattern="^(income|expense)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get transactions for a specific category, grouped by label.

    Returns a list of { label, total, count, transactions: [...] }.
    Use category_id=null (or omit it) for uncategorized transactions.
    """
    service = AnalyticsService(db)
    return await service.category_detail(
        user=current_user,
        category_id=category_id,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
        direction=direction,
    )
