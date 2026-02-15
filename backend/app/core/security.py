"""Security utilities: Amazon Cognito OIDC token validation and user provisioning."""

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
JWKS_CACHE_TTL = 3600  # 1 hour (Cognito keys rotate infrequently)


async def _fetch_jwks() -> dict:
    """Fetch the JSON Web Key Set from Amazon Cognito."""
    global _jwks_cache, _jwks_cache_time

    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache

    async with httpx.AsyncClient() as client:
        response = await client.get(settings.cognito_jwks_url, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = now
        logger.info("JWKS fetched from Cognito", url=settings.cognito_jwks_url)
        return _jwks_cache


def _find_signing_key(jwks: dict, kid: str) -> dict | None:
    """Find the signing key matching the token's kid."""
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def decode_access_token(token: str) -> dict:
    """Decode and validate a Cognito access token (RS256)."""
    try:
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
            issuer=settings.cognito_issuer_url,
            # Cognito access tokens have client_id in the "client_id" claim,
            # not in "aud". We validate the issuer and token_use instead.
            options={"verify_aud": False, "verify_at_hash": False},
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from e

    # Cognito access tokens must have token_use=access
    if payload.get("token_use") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type (expected access token)",
        )

    return payload


async def decode_id_token(token: str) -> dict:
    """Decode and validate a Cognito ID token (RS256).

    ID tokens contain user profile claims (email, name, etc.).
    """
    try:
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

    jwks = await _fetch_jwks()
    signing_key = _find_signing_key(jwks, kid)

    if not signing_key:
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
            audience=settings.cognito_client_id,
            issuer=settings.cognito_issuer_url,
            options={"verify_at_hash": False},
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired ID token",
        ) from e

    if payload.get("token_use") != "id":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type (expected id token)",
        )

    return payload


# ── Auth Dependencies ─────────────────────────────
security_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):
    """FastAPI dependency: validate Cognito JWT and return (or provision) local user."""
    from app.models.user import User

    payload = await decode_access_token(credentials.credentials)

    cognito_sub = payload.get("sub")
    if not cognito_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )

    # Look up local user by Cognito sub
    result = await db.execute(
        select(User).where(User.keycloak_id == cognito_sub, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()

    if user is None:
        # Auto-provision: create local user from Cognito token claims.
        # Cognito access tokens contain username but not email/name.
        # We use the username claim for initial provisioning; profile
        # data will be synced when the frontend calls POST /auth/sync.
        username = payload.get("username", cognito_sub)

        user = User(
            keycloak_id=cognito_sub,
            email=username if "@" in username else f"{username}@pending",
            full_name=username,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
        logger.info(
            "Auto-provisioned local user from Cognito",
            cognito_sub=cognito_sub,
            username=username,
        )

    return user
