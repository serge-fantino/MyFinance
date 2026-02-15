"""Security utilities: Keycloak OIDC token validation and user provisioning."""

import time

import httpx
import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db

logger = structlog.get_logger()

# ── JWKS cache ────────────────────────────────────
_jwks_cache: dict | None = None
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 300  # 5 minutes


async def _fetch_jwks() -> dict:
    """Fetch the JSON Web Key Set from Keycloak."""
    global _jwks_cache, _jwks_cache_time

    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache

    async with httpx.AsyncClient() as client:
        response = await client.get(settings.keycloak_jwks_url, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = now
        logger.info("JWKS fetched from Keycloak", url=settings.keycloak_jwks_url)
        return _jwks_cache


def _find_signing_key(jwks: dict, kid: str) -> dict | None:
    """Find the signing key matching the token's kid."""
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def decode_access_token(token: str) -> dict:
    """Decode and validate a Keycloak access token (RS256)."""
    try:
        # Read the unverified header to get kid
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token header",
        ) from e

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing key ID",
        )

    # Fetch JWKS and find the matching key
    jwks = await _fetch_jwks()
    signing_key = _find_signing_key(jwks, kid)

    if not signing_key:
        # Key may have rotated — force refresh
        global _jwks_cache_time
        _jwks_cache_time = 0
        jwks = await _fetch_jwks()
        signing_key = _find_signing_key(jwks, kid)

    if not signing_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to find matching signing key",
        )

    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience="account",
            issuer=settings.keycloak_issuer_url,
            options={"verify_at_hash": False},
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from e


# ── Auth Dependencies ─────────────────────────────
security_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):
    """FastAPI dependency: validate Keycloak JWT and return (or provision) local user."""
    from app.models.user import User

    payload = await decode_access_token(credentials.credentials)

    keycloak_id = payload.get("sub")
    if not keycloak_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )

    # Look up local user by Keycloak ID
    result = await db.execute(
        select(User).where(User.keycloak_id == keycloak_id, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()

    if user is None:
        # Auto-provision: create local user from Keycloak token claims
        email = payload.get("email", "")
        full_name = payload.get("name", "") or _build_name(payload)
        realm_roles = payload.get("realm_access", {}).get("roles", [])

        user = User(
            keycloak_id=keycloak_id,
            email=email,
            full_name=full_name or email,
            is_admin="admin" in realm_roles,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        logger.info(
            "Auto-provisioned local user from Keycloak",
            keycloak_id=keycloak_id,
            email=email,
        )
    else:
        # Sync email/name if changed in Keycloak
        email = payload.get("email", "")
        full_name = payload.get("name", "") or _build_name(payload)
        changed = False
        if email and user.email != email:
            user.email = email
            changed = True
        if full_name and user.full_name != full_name:
            user.full_name = full_name
            changed = True
        if changed:
            await db.flush()

    return user


def _build_name(payload: dict) -> str:
    """Build full name from given_name + family_name claims."""
    parts = [payload.get("given_name", ""), payload.get("family_name", "")]
    return " ".join(p for p in parts if p).strip()
