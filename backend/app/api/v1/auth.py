"""Authentication API routes.

With Amazon Cognito, login/register/refresh/MFA are handled by the IdP.
The backend validates OIDC tokens and manages the local user record.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.security import decode_id_token
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def auth_me(user: User = Depends(get_current_user)):
    """Return the current authenticated user (auto-provisions on first call).

    The frontend calls this after Cognito login to fetch/create the local user.
    """
    return user


class SyncRequest(BaseModel):
    id_token: str


@router.post("/sync", response_model=UserResponse)
async def auth_sync(
    data: SyncRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sync local user profile with Cognito ID token claims.

    Cognito access tokens don't carry email/name claims. The frontend
    sends the ID token here after login so we can update the local record
    with the full user profile.
    """
    payload = await decode_id_token(data.id_token)

    # Verify the ID token belongs to the same user
    if payload.get("sub") != user.keycloak_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ID token does not match current user",
        )

    # Sync profile fields
    changed = False
    email = payload.get("email", "")
    name = payload.get("name", "")

    if email and user.email != email:
        user.email = email
        changed = True
    if name and user.full_name != name:
        user.full_name = name
        changed = True

    if changed:
        await db.flush()
        await db.refresh(user)

    return user
