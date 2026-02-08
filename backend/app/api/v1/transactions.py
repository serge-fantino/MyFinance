"""Transaction API routes."""

from datetime import date
from decimal import Decimal

import structlog
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.transaction import (
    ClusterClassifyRequest,
    ClusterClassifyResult,
    ClustersResponse,
    ComputeEmbeddingsResult,
    ImportResult,
    PaginatedResponse,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from app.services.embedding_service import EmbeddingService
from app.services.import_service import ImportService
from app.services.transaction_service import TransactionService

logger = structlog.get_logger()

router = APIRouter()


@router.get("", response_model=PaginatedResponse)
async def list_transactions(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    account_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    amount_min: Decimal | None = None,
    amount_max: Decimal | None = None,
    search: str | None = None,
    sort_by: str = "date",
    sort_order: str = "desc",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List transactions with pagination and filters."""
    service = TransactionService(db)
    return await service.list_transactions(
        user=current_user,
        page=page,
        per_page=per_page,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
        category_id=category_id,
        amount_min=amount_min,
        amount_max=amount_max,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post("", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a transaction manually."""
    service = TransactionService(db)
    return await service.create_transaction(data, current_user)


@router.get("/cashflow")
async def get_cashflow(
    account_id: int | None = None,
    granularity: str = Query("monthly", pattern="^(monthly|daily)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cashflow aggregates (monthly bars or daily cumulative line)."""
    service = TransactionService(db)
    return await service.get_cashflow(current_user, account_id, granularity)


# ── Embedding-based classification endpoints ─────────────


@router.post("/compute-embeddings", response_model=ComputeEmbeddingsResult)
async def compute_embeddings(
    account_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compute embeddings for transactions that don't have one yet.

    This is a prerequisite for clustering and similarity-based suggestions.
    Embeddings are computed locally using sentence-transformers (no GPU needed).
    """
    service = EmbeddingService(db)
    return await service.compute_missing_embeddings(current_user, account_id)


@router.get("/clusters", response_model=ClustersResponse)
async def get_clusters(
    account_id: int | None = None,
    min_cluster_size: int = Query(3, ge=2, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get clusters of similar uncategorized transactions with category suggestions.

    Each cluster groups transactions with similar labels/patterns and proposes
    a category based on:
    1. Previously classified similar transactions (k-NN)
    2. Semantic similarity to category names (fallback)

    The user decides whether to accept, modify, or ignore each suggestion.
    """
    service = EmbeddingService(db)
    return await service.get_clusters(current_user, account_id, min_cluster_size)


@router.post("/clusters/classify", response_model=ClusterClassifyResult)
async def classify_cluster(
    data: ClusterClassifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Classify a cluster (or arbitrary set) of transactions.

    Applies the chosen category to all specified transactions.
    Optionally creates a classification rule for future transactions.
    The user always controls what gets classified — nothing is automatic.
    """
    service = EmbeddingService(db)
    return await service.classify_transactions(
        transaction_ids=data.transaction_ids,
        category_id=data.category_id,
        user=current_user,
        custom_label=data.custom_label,
        create_rule=data.create_rule,
        rule_pattern=data.rule_pattern,
    )


# ── Single transaction CRUD ─────────────────────────────


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific transaction."""
    service = TransactionService(db)
    return await service.get_transaction(transaction_id, current_user)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a transaction (category, notes, tags)."""
    service = TransactionService(db)
    return await service.update_transaction(transaction_id, data, current_user)


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a transaction."""
    service = TransactionService(db)
    await service.delete_transaction(transaction_id, current_user)


# ── Import ──────────────────────────────────────────────


@router.post("/import", response_model=ImportResult)
async def import_transactions(
    account_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import transactions from a file (CSV, Excel, OFX/QFX/XML).

    After a successful import:
    1. Applies user classification rules (fast, deterministic)
    2. Computes embeddings for new transactions (local, no API call)

    Classification suggestions are then available via GET /clusters.
    """
    content = await file.read()
    service = ImportService(db)
    result = await service.import_file(
        user=current_user,
        account_id=account_id,
        filename=file.filename or "upload",
        content=content,
    )

    # Auto-classify with rules (fast, no API call)
    if result["imported_count"] > 0:
        try:
            from app.services.rule_service import RuleService
            rule_service = RuleService(db)
            rule_result = await rule_service.apply_rules(current_user, account_id)
            result["rules_applied"] = rule_result["applied"]
            logger.info(
                "auto_rules_after_import",
                imported=result["imported_count"],
                rules_applied=rule_result["applied"],
            )
        except Exception as e:
            logger.warning("auto_rules_failed", error=str(e))
            result["rules_applied"] = 0

    # Compute embeddings for new transactions (local, best-effort)
    if result["imported_count"] > 0:
        try:
            embedding_service = EmbeddingService(db)
            emb_result = await embedding_service.compute_missing_embeddings(
                current_user, account_id
            )
            result["embeddings_computed"] = emb_result["computed"]
            logger.info(
                "auto_embeddings_after_import",
                imported=result["imported_count"],
                embeddings_computed=emb_result["computed"],
            )
        except Exception as e:
            logger.warning("auto_embeddings_failed", error=str(e))
            result["embeddings_computed"] = 0

    return result
