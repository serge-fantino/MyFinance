"""MyFinance API — Main entry point."""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.core.database import async_session_factory, engine
from app.core.middleware import RequestLoggingMiddleware

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    logger.info("Starting MyFinance API", env=settings.app_env)
    yield
    # Shutdown
    logger.info("Shutting down MyFinance API")
    await engine.dispose()


app = FastAPI(
    title="MyFinance API",
    description="API de gestion de finances personnelles avec IA",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    # Disable trailing slash redirects (307/308) which strip Authorization headers
    # when the frontend proxy follows the redirect cross-origin.
    redirect_slashes=False,
)

# ── Middleware ─────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)


# ── Health Check ──────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check():
    """Liveness probe — always returns healthy if the process is running."""
    return {"status": "healthy", "version": "0.1.0"}


@app.get("/ready", tags=["system"])
async def readiness_check():
    """Readiness probe — checks DB connectivity."""
    checks = {"database": "unknown", "api": "ok"}
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
            checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"
        return {"status": "degraded", "checks": checks}

    return {"status": "ready", "checks": checks}


# ── API Routes ────────────────────────────────────
from app.api.v1 import accounts, ai, analytics, auth, categories, classification, classification_rules, transactions, users  # noqa: E402

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["accounts"])
app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["transactions"])
app.include_router(categories.router, prefix="/api/v1/categories", tags=["categories"])
app.include_router(classification.router, prefix="/api/v1/classification", tags=["classification"])
app.include_router(classification_rules.router, prefix="/api/v1/classification-rules", tags=["classification-rules"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
