"""AI chat schemas."""

from datetime import datetime

from pydantic import BaseModel


class ChatMessage(BaseModel):
    content: str
    conversation_id: int | None = None
    account_ids: list[int] | None = None  # scope ceiling from UI


class VizEncoding(BaseModel):
    """A single channel encoding."""
    field: str
    type: str = "nominal"  # nominal, quantitative, temporal
    format: str | None = None  # "currency", etc.

    model_config = {"extra": "allow"}


class VizSpec(BaseModel):
    """Visualization specification (chart type + channel encodings)."""
    chart: str  # bar, pie, area, kpi
    title: str | None = None
    encoding: dict[str, VizEncoding] = {}

    model_config = {"extra": "allow"}


class ChartResult(BaseModel):
    """A fully resolved chart: viz spec + query result data."""
    viz: VizSpec
    data: list[dict]


class ChatResponse(BaseModel):
    conversation_id: int
    message: str
    charts: list[ChartResult] = []
    metadata: dict | None = None


class ConversationResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    metadata: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailResponse(BaseModel):
    id: int
    title: str
    messages: list[MessageResponse]
    created_at: datetime


class ProviderStatusResponse(BaseModel):
    provider: str
    available: bool
