"""Transaction cluster API routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.cluster import (
    ClusterCreate,
    ClusterFromProposal,
    ClusterResponse,
    ClusterTransactionResponse,
    ClusterUpdate,
)
from app.services.cluster_service import ClusterService

router = APIRouter()


@router.get("", response_model=list[ClusterResponse])
async def list_clusters(
    account_id: int | None = None,
    category_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List transaction clusters, optionally filtered by account or category."""
    service = ClusterService(db)
    return await service.list_clusters(current_user, account_id, category_id)


@router.get("/{cluster_id}", response_model=ClusterResponse)
async def get_cluster(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single cluster with its statistics."""
    service = ClusterService(db)
    result = await service.get_cluster(current_user, cluster_id)
    if not result:
        raise HTTPException(status_code=404, detail="Cluster introuvable")
    return result


@router.post("", response_model=ClusterResponse, status_code=201)
async def create_cluster(
    data: ClusterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new transaction cluster."""
    service = ClusterService(db)
    return await service.create_cluster(
        user=current_user,
        name=data.name,
        transaction_ids=data.transaction_ids,
        account_id=data.account_id,
        category_id=data.category_id,
        description=data.description,
        source=data.source,
        rule_pattern=data.rule_pattern,
        match_type=data.match_type,
    )


@router.post("/from-proposal", response_model=ClusterResponse, status_code=201)
async def create_from_proposal(
    data: ClusterFromProposal,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a persistent cluster from a classification proposal cluster."""
    service = ClusterService(db)
    try:
        return await service.create_from_proposal_cluster(
            user=current_user,
            proposal_cluster_id=data.proposal_cluster_id,
            name=data.name,
            category_id=data.category_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{cluster_id}", response_model=ClusterResponse)
async def update_cluster(
    cluster_id: int,
    data: ClusterUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a cluster (name, description, category, transactions)."""
    service = ClusterService(db)
    result = await service.update_cluster(
        user=current_user,
        cluster_id=cluster_id,
        name=data.name,
        description=data.description,
        category_id=data.category_id,
        transaction_ids=data.transaction_ids,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Cluster introuvable")
    return result


@router.delete("/{cluster_id}", status_code=204)
async def delete_cluster(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a transaction cluster."""
    service = ClusterService(db)
    deleted = await service.delete_cluster(current_user, cluster_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cluster introuvable")


@router.post("/{cluster_id}/recompute", response_model=ClusterResponse)
async def recompute_statistics(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Force recomputation of cluster statistics."""
    service = ClusterService(db)
    result = await service.recompute_cluster_stats(current_user, cluster_id)
    if not result:
        raise HTTPException(status_code=404, detail="Cluster introuvable")
    return result


@router.get("/{cluster_id}/transactions", response_model=list[ClusterTransactionResponse])
async def get_cluster_transactions(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the full list of transactions belonging to a cluster."""
    service = ClusterService(db)
    return await service.get_cluster_transactions(current_user, cluster_id)
