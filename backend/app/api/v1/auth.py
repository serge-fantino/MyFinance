"""Authentication API routes."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.user import AuthResponse, TokenResponse, UserLogin, UserRegister
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(data: UserRegister, request: Request, db: AsyncSession = Depends(get_db)):
    """Register a new user. Returns user info + tokens (auto-login)."""
    service = AuthService(db)
    return await service.register(data, request)


@router.post("/login", response_model=AuthResponse)
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    """Login and get user info + tokens."""
    service = AuthService(db)
    return await service.login(data, request)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token_endpoint(
    refresh_token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using a valid refresh token."""
    service = AuthService(db)
    return await service.refresh(refresh_token, request)
