"""MyFinance API — Main entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.database import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="MyFinance API",
    description="API de gestion de finances personnelles avec IA",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health Check ──────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "healthy", "version": "0.1.0"}


@app.get("/ready", tags=["system"])
async def readiness_check():
    # TODO: check DB and Redis connectivity
    return {"status": "ready"}


# ── API Routes ────────────────────────────────────
# Routes will be registered here as they are implemented:
# from app.api.v1 import auth, users, accounts, transactions, categories, analytics, ai
# app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
# app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
# app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["accounts"])
# app.include_router(transactions.router, prefix="/api/v1/transactions", tags=["transactions"])
# app.include_router(categories.router, prefix="/api/v1/categories", tags=["categories"])
# app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
# app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
