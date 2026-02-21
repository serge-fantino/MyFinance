"""AI chat schemas."""

from datetime import datetime

from pydantic import BaseModel


class ChatMessage(BaseModel):
    content: str
    conversation_id: int | None = None


class ChatResponse(BaseModel):
    conversation_id: int
    message: str
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
