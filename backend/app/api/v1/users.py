"""User management API routes."""

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile."""
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update current user profile."""
    # TODO: implement update logic
    raise NotImplementedError


@router.delete("/me", status_code=204)
async def delete_account(current_user: User = Depends(get_current_user)):
    """Soft delete current user account."""
    # TODO: implement soft delete
    raise NotImplementedError
