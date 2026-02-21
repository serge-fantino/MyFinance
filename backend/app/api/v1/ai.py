"""AI assistant API routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.ai import (
    ChatMessage,
    ChatResponse,
    ConversationDetailResponse,
    ConversationResponse,
    MessageResponse,
    ProviderStatusResponse,
)
from app.services.chat_service import ChatService

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    message: ChatMessage,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to the AI assistant."""
    service = ChatService(db)
    result = await service.chat(
        user=current_user,
        content=message.content,
        conversation_id=message.conversation_id,
        account_ids=message.account_ids,
        debug=message.debug,
    )
    return ChatResponse(**result)


@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all conversations for current user."""
    service = ChatService(db)
    conversations = await service.list_conversations(current_user)
    return conversations


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get conversation with full message history."""
    service = ChatService(db)
    conv = await service.get_conversation(conversation_id, current_user)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation non trouvée")
    return ConversationDetailResponse(
        id=conv.id,
        title=conv.title,
        messages=[
            MessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                metadata=m.metadata_,
                created_at=m.created_at,
            )
            for m in conv.messages
        ],
        created_at=conv.created_at,
    )


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation."""
    service = ChatService(db)
    deleted = await service.delete_conversation(conversation_id, current_user)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation non trouvée")
    return {"ok": True}


@router.get("/status", response_model=ProviderStatusResponse)
async def provider_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if the AI provider is available."""
    service = ChatService(db)
    return await service.check_provider_status()
