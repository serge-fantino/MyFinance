"""User session management (list, revoke)."""

import uuid
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_session import UserSession


def _get_client_ip(request: Request) -> str | None:
    """Extract client IP (supports X-Forwarded-For for proxies)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _get_fingerprint(request: Request) -> str | None:
    """Extract client fingerprint from header (sent by frontend)."""
    return request.headers.get("X-Client-Fingerprint")


def _get_device_info(request: Request) -> str | None:
    """Extract human-readable device info (browser, OS, device type) from header."""
    return request.headers.get("X-Device-Info")


class SessionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def get_client_info(self, request: Request) -> tuple[str | None, str | None]:
        return _get_client_ip(request), _get_fingerprint(request)

    async def create_session(
        self,
        user_id: int,
        request: Request,
    ) -> tuple[str, UserSession]:
        """Create a new session and return (jti, session)."""
        ip = _get_client_ip(request)
        fingerprint = _get_fingerprint(request)
        device_info = _get_device_info(request)
        jti = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        session = UserSession(
            user_id=user_id,
            token_jti=jti,
            ip_address=ip,
            fingerprint=fingerprint,
            device_info=device_info,
            created_at=now,
            last_used_at=now,
        )
        self.db.add(session)
        await self.db.flush()
        return jti, session

    async def validate_and_touch_session(self, jti: str, user_id: int) -> bool:
        """Check session exists and update last_used_at. Returns True if valid."""
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.token_jti == jti,
                UserSession.user_id == user_id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            return False
        session.last_used_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    async def list_sessions(self, user: User) -> list[dict]:
        """List all active sessions for the user."""
        result = await self.db.execute(
            select(UserSession)
            .where(UserSession.user_id == user.id)
            .order_by(UserSession.last_used_at.desc())
        )
        sessions = result.scalars().all()
        return [
            {
                "id": s.id,
                "ip_address": s.ip_address,
                "fingerprint": s.fingerprint,
                "device_info": s.device_info,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "last_used_at": s.last_used_at.isoformat() if s.last_used_at else None,
            }
            for s in sessions
        ]

    async def revoke_session(self, user: User, session_id: int) -> bool:
        """Revoke a session by id. Returns True if found and deleted."""
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.id == session_id,
                UserSession.user_id == user.id,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            return False
        await self.db.delete(session)
        await self.db.flush()
        return True
