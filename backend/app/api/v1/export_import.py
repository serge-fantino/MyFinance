"""Export/import API for categories and classification rules (YAML)."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.services.export_import_service import export_categories_and_rules, import_categories_and_rules

router = APIRouter()


@router.get("/export", response_class=PlainTextResponse)
async def export_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export user categories and classification rules as YAML.
    Use for backup, recreating an account, or sharing rules."""
    content = await export_categories_and_rules(db, current_user)
    return PlainTextResponse(
        content=content,
        media_type="application/x-yaml",
        headers={"Content-Disposition": "attachment; filename=myfinance-export.yaml"},
    )


class ImportRequest(BaseModel):
    """Request body for import: raw YAML string."""

    content: str


class ImportResponse(BaseModel):
    """Import result."""

    categories_created: int
    rules_created: int
    rules_skipped: int


@router.post("/import", response_model=ImportResponse)
async def import_settings(
    data: ImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import categories and rules from YAML. Merges with existing (no replace)."""
    try:
        result = await import_categories_and_rules(db, current_user, data.content, merge=True)
        return ImportResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
