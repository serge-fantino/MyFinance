"""Transaction API routes."""

from datetime import date
from decimal import Decimal

import structlog
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.transaction import Transaction
from app.models.user import User
from app.config import settings
from app.schemas.transaction import (
    ClusterClassifyRequest,
    ClusterClassifyResult,
    ClustersResponse,
    ComputeEmbeddingsResult,
    ImportResult,
    InterpretClusterRequest,
    InterpretClusterResult,
    InterpretClusterSuggestion,
    LlmStatusResponse,
    PaginatedResponse,
    ParseLabelsResult,
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


@router.post("/parse-labels", response_model=ParseLabelsResult)
async def parse_labels(
    account_id: int | None = None,
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Parse raw labels to extract structured metadata (counterparty, card, etc.).

    Runs the label parser on existing transactions that haven't been parsed yet.
    Use force=true to re-parse all transactions (useful after parser improvements).

    Parsed transactions will have their embeddings reset so they are recomputed
    using the cleaned counterparty text on the next embedding computation.
    """
    from app.models.account import Account
    from app.services.label_parser import parse_label

    user_accounts = select(Account.id).where(Account.user_id == current_user.id)
    query = select(Transaction).where(
        Transaction.account_id.in_(user_accounts),
        Transaction.deleted_at.is_(None),
    )
    if account_id:
        query = query.where(Transaction.account_id == account_id)
    if not force:
        query = query.where(Transaction.parsed_metadata.is_(None))

    result = await db.execute(query)
    transactions = list(result.scalars().all())

    parsed_count = 0
    for txn in transactions:
        metadata = parse_label(txn.label_raw)
        txn.parsed_metadata = metadata
        # Reset embedding so it gets recomputed with cleaned counterparty text
        txn.embedding = None
        parsed_count += 1

    await db.flush()

    logger.info(
        "labels_parsed",
        user_id=current_user.id,
        parsed=parsed_count,
        total=len(transactions),
        force=force,
    )

    return {"parsed": parsed_count, "total": len(transactions)}


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
    distance_threshold: float | None = Query(
        None,
        ge=0.08,
        le=0.95,
        description="Cosine distance threshold: lower = more selective (tighter clusters), higher = more grouping.",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get clusters of similar uncategorized transactions with category suggestions.

    distance_threshold: controls how strict the grouping is. Lower values (e.g. 0.25–0.35)
    produce smaller, more homogeneous clusters; higher values (e.g. 0.6–0.7) group more loosely.

    Each cluster proposes a category via k-NN on classified transactions or category semantics.
    """
    service = EmbeddingService(db)
    return await service.get_clusters(
        current_user, account_id, min_cluster_size, distance_threshold
    )


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


@router.get("/clusters/llm-status", response_model=LlmStatusResponse)
async def get_llm_status(
    current_user: User = Depends(get_current_user),
):
    """Return whether the LLM (Ollama) UI is enabled. When false, frontend hides the « Interpréter (LLM) » button."""
    return LlmStatusResponse(ui_enabled=settings.llm_ui_enabled)


@router.post("/clusters/interpret", response_model=InterpretClusterResult)
async def interpret_cluster(
    data: InterpretClusterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invoke the local LLM to interpret a cluster and suggest a category.

    Returns the raw LLM response (for debugging) and the parsed suggestion.
    Use this from the suggestions modal to see what the LLM returns per cluster.
    """
    from app.services.llm_service import LLMService

    embedding_service = EmbeddingService(db)
    enriched_cats = await embedding_service._get_enriched_categories(current_user)

    transactions_with_id = [
        {"id": t.id, "label_raw": t.label_raw, "amount": t.amount, "date": t.date}
        for t in data.transactions
    ]

    llm_service = LLMService()
    available = await llm_service.is_available()
    if not available:
        from app.config import settings
        hint = (
            "make dev-infra (démarrer l'infra dont Ollama), puis make ollama-pull (télécharger le modèle). "
            f"Vérifier LLM_BASE_URL (actuel : {settings.llm_base_url}), LLM_MODEL (actuel : {settings.llm_model})."
        )
        return InterpretClusterResult(
            llm_available=False,
            error=f"Ollama non disponible. {hint}",
        )

    try:
        raw_response, suggestion = await llm_service.suggest_category_with_subselection(
            representative_label=data.representative_label,
            transactions=transactions_with_id,
            categories=enriched_cats,
        )
        parsed = None
        if suggestion:
            parsed = InterpretClusterSuggestion(
                category_id=suggestion["category_id"],
                category_name=suggestion["category_name"],
                confidence=suggestion.get("confidence", "medium"),
                explanation=suggestion.get("explanation", ""),
                suggested_include_ids=suggestion.get("suggested_include_ids"),
            )
        return InterpretClusterResult(
            llm_available=True,
            raw_response=raw_response,
            suggestion=parsed,
        )
    except Exception as e:
        logger.exception("interpret_cluster_failed")
        return InterpretClusterResult(
            llm_available=True,
            raw_response=None,
            error=str(e),
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
