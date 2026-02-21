"""Chat service — orchestrates AI conversations.

Manages conversation persistence, financial context injection,
and LLM interaction for the AI assistant.
"""

import json

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation, Message
from app.models.user import User
from app.services.financial_context import FinancialContextBuilder
from app.services.llm_provider import get_llm_provider

logger = structlog.get_logger()

SYSTEM_PROMPT = """Tu es un assistant financier personnel intelligent. Tu aides l'utilisateur à comprendre ses finances personnelles.

Règles :
- Réponds toujours en français.
- Sois concis et précis. Utilise des chiffres et des pourcentages.
- Quand tu analyses des données financières, donne des observations utiles et des tendances.
- Si tu identifies des anomalies ou des points d'attention, signale-les.
- Utilise le format markdown pour structurer ta réponse (titres, listes, gras).
- Quand des données chiffrées sont fournies, base-toi UNIQUEMENT sur ces données. Ne les invente pas.
- Si tu n'as pas assez de données pour répondre, dis-le clairement.

Capacités de visualisation :
- Tu peux inclure des visualisations dans ta réponse en utilisant des blocs de code spéciaux.
- Pour insérer un graphique, utilise un bloc ```chart suivi d'un JSON décrivant le graphique.
- Types disponibles : "bar", "pie", "area", "kpi"
- Le frontend les rendra automatiquement.

Exemples de blocs chart :

Pour un graphique en barres :
```chart
{"type": "bar", "title": "Revenus vs Dépenses", "data": [{"label": "Jan", "revenus": 3000, "depenses": 2500}, {"label": "Fév", "revenus": 3200, "depenses": 2800}]}
```

Pour un camembert :
```chart
{"type": "pie", "title": "Répartition", "data": [{"name": "Alimentation", "value": 450}, {"name": "Transport", "value": 200}]}
```

Pour des KPI :
```chart
{"type": "kpi", "title": "Résumé", "data": [{"label": "Solde", "value": 15000}, {"label": "Revenus", "value": 3500}, {"label": "Dépenses", "value": 2800}]}
```

Pour une courbe d'évolution :
```chart
{"type": "area", "title": "Évolution du solde", "data": [{"date": "2025-01", "value": 14000}, {"date": "2025-02", "value": 14500}]}
```

N'utilise les blocs chart que quand c'est pertinent pour illustrer ta réponse.
"""


class ChatService:
    """Orchestrates AI chat conversations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.context_builder = FinancialContextBuilder(db)
        self.llm = get_llm_provider()

    async def chat(
        self,
        user: User,
        content: str,
        conversation_id: int | None = None,
    ) -> dict:
        """Process a chat message and return the AI response.

        Returns:
            {
                "conversation_id": int,
                "message": str,
                "metadata": {"intents": [...], "charts": {...}, "provider": str}
            }
        """
        # Get or create conversation
        conversation = await self._get_or_create_conversation(user, conversation_id)

        # Save user message
        user_msg = Message(
            conversation_id=conversation.id,
            role="user",
            content=content,
        )
        self.db.add(user_msg)
        await self.db.flush()

        # Build financial context from user question
        financial_context, chart_suggestions = await self.context_builder.build_context(
            user, content
        )

        # Build message history (last N messages for context)
        history = await self._get_message_history(conversation.id, limit=10)

        # Build the full prompt with financial context
        enriched_system = SYSTEM_PROMPT + f"\n\n=== DONNÉES FINANCIÈRES DE L'UTILISATEUR ===\n{financial_context}"

        # Call LLM
        response_text = await self.llm.chat(
            system_prompt=enriched_system,
            messages=history,
            temperature=0.3,
        )

        # Save assistant message
        assistant_msg = Message(
            conversation_id=conversation.id,
            role="assistant",
            content=response_text,
            metadata_={
                "charts": chart_suggestions,
                "provider": type(self.llm).__name__,
            },
        )
        self.db.add(assistant_msg)

        # Update conversation title from first message
        if len(history) <= 1:
            conversation.title = content[:100]

        await self.db.flush()

        return {
            "conversation_id": conversation.id,
            "message": response_text,
            "metadata": {
                "charts": chart_suggestions,
                "provider": type(self.llm).__name__,
            },
        }

    async def list_conversations(self, user: User) -> list[Conversation]:
        """List all conversations for a user, most recent first."""
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.user_id == user.id)
            .order_by(Conversation.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_conversation(
        self, conversation_id: int, user: User
    ) -> Conversation | None:
        """Get a conversation with all messages."""
        result = await self.db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(
                Conversation.id == conversation_id,
                Conversation.user_id == user.id,
            )
        )
        return result.scalar_one_or_none()

    async def delete_conversation(
        self, conversation_id: int, user: User
    ) -> bool:
        """Delete a conversation and its messages."""
        conv = await self.get_conversation(conversation_id, user)
        if not conv:
            return False
        await self.db.delete(conv)
        await self.db.flush()
        return True

    async def check_provider_status(self) -> dict:
        """Check if the configured LLM provider is available."""
        available = await self.llm.is_available()
        return {
            "provider": type(self.llm).__name__,
            "available": available,
        }

    async def _get_or_create_conversation(
        self, user: User, conversation_id: int | None
    ) -> Conversation:
        """Get existing or create a new conversation."""
        if conversation_id:
            result = await self.db.execute(
                select(Conversation).where(
                    Conversation.id == conversation_id,
                    Conversation.user_id == user.id,
                )
            )
            conv = result.scalar_one_or_none()
            if conv:
                return conv

        # Create new conversation
        conv = Conversation(
            user_id=user.id,
            title="Nouvelle conversation",
        )
        self.db.add(conv)
        await self.db.flush()
        await self.db.refresh(conv)
        return conv

    async def _get_message_history(
        self, conversation_id: int, limit: int = 10
    ) -> list[dict]:
        """Get recent messages for conversation context."""
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        messages = list(result.scalars().all())
        messages.reverse()  # chronological order

        return [
            {"role": msg.role, "content": msg.content}
            for msg in messages
            if msg.role in ("user", "assistant")
        ]
