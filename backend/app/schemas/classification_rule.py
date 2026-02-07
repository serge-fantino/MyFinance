"""Classification rule schemas."""

from datetime import datetime

from pydantic import BaseModel


class RuleCreate(BaseModel):
    pattern: str
    match_type: str = "contains"  # contains, exact, starts_with
    category_id: int
    custom_label: str | None = None
    priority: int = 0


class RuleUpdate(BaseModel):
    pattern: str | None = None
    match_type: str | None = None
    category_id: int | None = None
    custom_label: str | None = None
    priority: int | None = None
    is_active: bool | None = None


class RuleResponse(BaseModel):
    id: int
    user_id: int
    pattern: str
    match_type: str
    category_id: int
    category_name: str | None = None
    custom_label: str | None
    priority: int
    is_active: bool
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApplyRulesResult(BaseModel):
    applied: int
    total_uncategorized: int
