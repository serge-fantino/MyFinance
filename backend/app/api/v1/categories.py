"""Category API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.category import CategoryResponse
from app.services.category_service import CategoryService

router = APIRouter()


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all categories (system + user custom) as a tree."""
    service = CategoryService(db)
    return await service.get_category_tree(current_user)
