"""Shared test fixtures."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401  — ensure all models are loaded for SQLAlchemy relationship resolution
from app.config import settings


# ── HTTP client fixture (for API-level tests like health checks) ──
# Imports app.main which pulls heavy deps (sentence_transformers, etc.)
# so we wrap in try/except to skip gracefully in minimal environments.

try:
    from httpx import ASGITransport, AsyncClient
    from app.main import app as _fastapi_app

    @pytest.fixture
    async def client():
        """Async test client for the FastAPI app."""
        async with AsyncClient(
            transport=ASGITransport(app=_fastapi_app),
            base_url="http://test",
        ) as ac:
            yield ac

except ImportError:
    @pytest.fixture
    def client():
        pytest.skip("httpx or app.main not importable (missing sentence_transformers?)")


@pytest.fixture
async def db():
    """Database session for tests.

    Engine is created inside the fixture so asyncpg connections are bound
    to the correct event loop.  NullPool avoids pooled-connection reuse
    across tests.
    """
    engine = create_async_engine(settings.database_url, echo=False, poolclass=NullPool)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        yield session
        # Commit any pending work so cleanup can see it
        try:
            await session.commit()
        except Exception:
            await session.rollback()

        # Clean up all test data in correct FK order
        await session.execute(text("DELETE FROM import_rows"))
        await session.execute(text("DELETE FROM transactions"))
        await session.execute(text("DELETE FROM import_logs"))
        await session.execute(text("DELETE FROM accounts"))
        await session.execute(text("DELETE FROM users WHERE email LIKE '%evol002%'"))
        await session.commit()

    await engine.dispose()


@pytest.fixture
async def test_user(db: AsyncSession):
    """Create a test user."""
    from app.models.user import User

    user = User(
        email="test-evol002@myfinance.local",
        password_hash="$2b$12$fakehashfortest",
        full_name="Test User EVOL002",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest.fixture
async def test_account(db: AsyncSession, test_user):
    """Create a test account."""
    from app.models.account import Account

    account = Account(
        user_id=test_user.id,
        name="Compte Test EVOL002",
        type="courant",
        currency="EUR",
    )
    db.add(account)
    await db.flush()
    return account


# ── Test data: CSV file content ──────────────────────────────

SAMPLE_CSV_CONTENT = (
    "date;montant;libelle\n"
    "15/01/2026;-42.50;CARTE BOULANGERIE DU COIN\n"
    "15/01/2026;-8.90;CARTE PHARMACIE MARTIN\n"
    "16/01/2026;+2800.00;VIR SEPA SALAIRE JANVIER\n"
    "17/01/2026;-750.00;VIR SEPA LOYER JANVIER\n"
    "18/01/2026;-29.99;PRLV SEPA NETFLIX\n"
).encode("utf-8")

# Same content — produces same file hash
SAMPLE_CSV_CONTENT_DUPLICATE = SAMPLE_CSV_CONTENT

# Different content (one extra row)
SAMPLE_CSV_CONTENT_OVERLAP = (
    "date;montant;libelle\n"
    "15/01/2026;-42.50;CARTE BOULANGERIE DU COIN\n"
    "19/01/2026;-15.00;CARTE TABAC PRESSE\n"
).encode("utf-8")
