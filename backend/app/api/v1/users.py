"""User management API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    SessionResponse,
    UserResponse,
    UserUpdate,
)
from app.services.session_service import SessionService
from app.services.user_service import UserService

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


@router.post("/me/password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change current user password."""
    service = UserService(db)
    await service.change_password(
        current_user, data.current_password, data.new_password
    )
    await db.commit()
    return {"message": "Mot de passe modifié"}


@router.get("/me/sessions", response_model=list[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active sessions (connections) for the current user."""
    service = SessionService(db)
    sessions = await service.list_sessions(current_user)
    return sessions


@router.delete("/me/sessions/{session_id}", status_code=204)
async def revoke_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a session (logout that device)."""
    service = SessionService(db)
    if not await service.revoke_session(current_user, session_id):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=404, detail="Session introuvable")
    await db.commit()


@router.delete("/me", status_code=204)
async def delete_account(
    data: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete account and all data. Requires confirmation='SUPPRIMER'."""
    service = UserService(db)
    await service.delete_account(current_user, data.confirmation)
    await db.commit()
