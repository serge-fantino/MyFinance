"""AI assistant API routes."""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.ai import (
    AIConfigUpdate,
    ChatMessage,
    ChatResponse,
    ConversationDetailResponse,
    ConversationResponse,
    MessageResponse,
    ProviderStatusResponse,
    QueryExecuteRequest,
)
from app.services.ai_config import set_provider
from app.services.chat_service import ChatService, convert_raw_to_placeholders
from app.services.metamodel import metamodel_prompt_json
from app.services.query_engine import QueryContext, execute_query

logger = structlog.get_logger()
router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    message: ChatMessage,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to the AI assistant."""
    service = ChatService(db)
    try:
        result = await service.chat(
            user=current_user,
            content=message.content,
            conversation_id=message.conversation_id,
            account_ids=message.account_ids,
            debug=message.debug,
        )
        return ChatResponse(**result)
    except Exception as e:
        logger.error("chat_endpoint_error", error=str(e), error_type=type(e).__name__)
        error_msg = f"Erreur serveur: {type(e).__name__}: {e}"
        debug_info = None
        if message.debug:
            debug_info = {"error": error_msg}
        return ChatResponse(
            conversation_id=message.conversation_id or 0,
            message="",
            error=error_msg,
            debug=debug_info,
        )


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
    messages_out = []
    for m in conv.messages:
        content = m.content
        meta = m.metadata_ or {}
        charts = meta.get("charts", [])
        # Convert old stored format (raw with ```dataviz) to placeholders if needed
        if m.role == "assistant" and charts and "```dataviz" in content:
            content = convert_raw_to_placeholders(content, charts)
        messages_out.append(
            MessageResponse(
                id=m.id,
                role=m.role,
                content=content,
                metadata=meta,
                created_at=m.created_at,
            )
        )
    return ConversationDetailResponse(
        id=conv.id,
        title=conv.title,
        messages=messages_out,
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
    """Check if the AI provider is available and return full config."""
    service = ChatService(db)
    return await service.check_provider_status()


@router.patch("/config", response_model=ProviderStatusResponse)
async def update_ai_config(
    payload: AIConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update AI config (e.g. provider) and return refreshed status."""
    if payload.provider is not None:
        set_provider(payload.provider)
    service = ChatService(db)
    return await service.check_provider_status()


@router.get("/metamodel")
async def get_metamodel(
    current_user: User = Depends(get_current_user),
):
    """Return the query metamodel (sources, fields, operators) for the Query module."""
    return metamodel_prompt_json()


@router.post("/query")
async def execute_dataviz_query(
    payload: QueryExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute a raw dataviz query and return chart data (interactive Query module)."""
    service = ChatService(db)
    account_ids = await service._resolve_account_scope(current_user, payload.account_ids)
    if not account_ids:
        raise HTTPException(status_code=400, detail="Aucun compte sélectionné")
    context = QueryContext(user_id=current_user.id, account_ids=account_ids)
    try:
        data, _col_names, sql_text = await execute_query(db, payload.query, context)
        return {
            "viz": payload.viz,
            "data": data,
            "trace": {
                "query": payload.query,
                "viz": payload.viz,
                "sql": sql_text,
                "row_count": len(data),
                "error": None,
            },
        }
    except Exception as e:
        logger.error("query_execute_error", error=str(e))
        error_msg = str(e)
        return {
            "viz": payload.viz,
            "data": [],
            "trace": {
                "query": payload.query,
                "viz": payload.viz,
                "sql": None,
                "row_count": 0,
                "error": error_msg,
            },
        }
