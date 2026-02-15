"""Classification proposal API.

One proposal per account. GET to fetch, POST recalculate to refresh, PATCH to update cluster states.
"""

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.classification import (
    ClassificationProposalResponse,
    ClassificationPatchRequest,
    RecalculateRequest,
    ApplyClusterRequest,
    ApplyClusterResponse,
    ReclusterRequest,
    ReclusterResponse,
    ReclusterDebug,
)
from app.services.classification_service import ClassificationService

logger = structlog.get_logger()

router = APIRouter()


@router.get("", response_model=ClassificationProposalResponse | None)
async def get_classification(
    account_id: int = Query(..., description="Account ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the classification proposal for an account. Returns None if no proposal exists."""
    service = ClassificationService(db)
    return await service.get_proposal(current_user, account_id)


@router.post("/recalculate", response_model=ClassificationProposalResponse)
async def recalculate_classification(
    data: RecalculateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recalculate classification: parse labels, compute embeddings, cluster. Replaces existing proposal."""
    service = ClassificationService(db)
    return await service.recalculate(
        current_user,
        data.account_id,
        data.distance_threshold,
    )


@router.patch("", response_model=ClassificationProposalResponse | None)
async def patch_classification(
    data: ClassificationPatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update cluster states (status, overrides, exclusions)."""
    if not data.cluster_updates:
        service = ClassificationService(db)
        return await service.get_proposal(current_user, data.account_id)

    service = ClassificationService(db)
    return await service.patch_proposal(
        current_user,
        data.account_id,
        [u.model_dump(exclude_unset=True) for u in data.cluster_updates],
    )


@router.post("/clusters/{cluster_id}/apply", response_model=ApplyClusterResponse)
async def apply_cluster(
    cluster_id: int,
    data: ApplyClusterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply category to a cluster's transactions. Marks cluster as accepted."""
    service = ClassificationService(db)
    return await service.apply_cluster(
        current_user,
        cluster_id,
        data.transaction_ids,
        data.category_id,
        data.create_rule,
        data.rule_pattern,
        data.custom_label,
    )


@router.post("/clusters/{cluster_id}/recluster", response_model=ReclusterResponse)
async def recluster_cluster(
    cluster_id: int,
    data: ReclusterRequest = ReclusterRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recluster a heterogeneous cluster. Uses LLM when available, else embeddings."""
    service = ClassificationService(db)
    proposal_dict, debug_info = await service.recluster(
        current_user, cluster_id, data.distance_threshold, data.use_llm
    )
    return ReclusterResponse(
        proposal=proposal_dict,
        debug=ReclusterDebug(**debug_info),
    )
