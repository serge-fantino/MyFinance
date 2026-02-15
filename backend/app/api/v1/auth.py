"""Authentication API routes.

With Keycloak, login/register/refresh are handled by the IdP.
The backend only validates the OIDC access token and manages
the local user record.
"""

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def auth_me(user: User = Depends(get_current_user)):
    """Return the current authenticated user (auto-provisions on first call).

    The frontend calls this after Keycloak login to fetch/create the local user.
    """
    return user
