"""Authentication service."""

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.user import AuthResponse, TokenResponse, UserLogin, UserRegister, UserResponse
from app.services.session_service import SessionService


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, data: UserRegister, request: Request | None = None) -> AuthResponse:
        """Register a new user and return tokens (auto-login)."""
        # Check if email already exists
        result = await self.db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un compte avec cet email existe déjà",
            )

        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            full_name=data.full_name,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)

        # Auto-login: create session and generate tokens
        if request:
            session_svc = SessionService(self.db)
            jti, _ = await session_svc.create_session(user.id, request)
            refresh = create_refresh_token(user.id, jti)
            access = create_access_token(user.id, jti)
        else:
            refresh = create_refresh_token(user.id)
            access = create_access_token(user.id)

        return AuthResponse(
            user=UserResponse.model_validate(user),
            access_token=access,
            refresh_token=refresh,
        )

    async def login(self, data: UserLogin, request: Request | None = None) -> AuthResponse:
        """Authenticate user and return user info + tokens."""
        result = await self.db.execute(
            select(User).where(User.email == data.email, User.is_active.is_(True))
        )
        user = result.scalar_one_or_none()

        if not user or not verify_password(data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Email ou mot de passe incorrect",
            )

        if request:
            session_svc = SessionService(self.db)
            jti, _ = await session_svc.create_session(user.id, request)
            refresh = create_refresh_token(user.id, jti)
            access = create_access_token(user.id, jti)
        else:
            refresh = create_refresh_token(user.id)
            access = create_access_token(user.id)

        return AuthResponse(
            user=UserResponse.model_validate(user),
            access_token=access,
            refresh_token=refresh,
        )

    async def refresh(self, refresh_token: str, request: Request | None = None) -> TokenResponse:
        """Refresh access token. Validates session exists (for revoke support)."""
        payload = decode_token(refresh_token)

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )

        user_id = int(payload["sub"])
        jti = payload.get("jti")

        # If token has jti, validate session exists (may have been revoked)
        if jti and request:
            session_svc = SessionService(self.db)
            if not await session_svc.validate_and_touch_session(jti, user_id):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session révoquée",
                )
            new_refresh = create_refresh_token(user_id, jti)
            new_access = create_access_token(user_id, jti)
        else:
            new_refresh = create_refresh_token(user_id)
            new_access = create_access_token(user_id)

        return TokenResponse(
            access_token=new_access,
            refresh_token=new_refresh,
        )
