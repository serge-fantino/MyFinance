"""Classification rules API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.classification_rule import (
    ApplyRulesResult,
    RuleCreate,
    RuleResponse,
    RuleUpdate,
)
from app.services.rule_service import RuleService

router = APIRouter()


@router.get("", response_model=list[RuleResponse])
async def list_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all classification rules for the current user."""
    service = RuleService(db)
    return await service.list_rules(current_user)


@router.post("", response_model=RuleResponse, status_code=201)
async def create_rule(
    data: RuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new classification rule."""
    service = RuleService(db)
    return await service.create_rule(data, current_user)


@router.patch("/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: int,
    data: RuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing classification rule."""
    service = RuleService(db)
    return await service.update_rule(rule_id, data, current_user)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a classification rule."""
    service = RuleService(db)
    await service.delete_rule(rule_id, current_user)


@router.post("/apply", response_model=ApplyRulesResult)
async def apply_rules(
    account_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply all active rules to uncategorized transactions."""
    service = RuleService(db)
    return await service.apply_rules(current_user, account_id)
