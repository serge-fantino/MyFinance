"""Chat service — orchestrates AI conversations.

Architecture (v2 — dataviz query engine):
  1. User sends a message + account_ids (UI scope)
  2. The LLM receives:
     - a system prompt describing the metamodel schema
     - the user's account list (names/types, not IDs)
     - the conversation history
  3. The LLM responds with free text + optional ```dataviz blocks
     containing {query, viz} JSON
  4. The chat service parses dataviz blocks, executes queries via the
     query engine, and returns {message, charts: [{viz, data}, ...]}
  5. Data never transits through the LLM — integrity is guaranteed
"""

import json
import re
import time

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.account import Account
from app.models.conversation import Conversation, Message
from app.models.user import User
from app.services.llm_provider import get_llm_provider
from app.services.metamodel import metamodel_prompt_text
from app.services.query_engine import (
    QueryContext,
    QueryExecutionError,
    QueryValidationError,
    execute_query,
)

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# System prompt — describes capabilities + metamodel schema
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT_TEMPLATE = """\
Tu es un assistant financier personnel intelligent. Tu aides l'utilisateur à comprendre ses finances personnelles.

Règles :
- Réponds toujours en français.
- Sois concis et précis. Utilise des chiffres et des pourcentages.
- Quand tu analyses des données financières, donne des observations utiles et des tendances.
- Si tu identifies des anomalies ou des points d'attention, signale-les.
- Utilise le format markdown pour structurer ta réponse (titres, listes, gras).
- Si tu n'as pas assez de données pour répondre, dis-le clairement.

=== VISUALISATIONS ===

Tu peux inclure des visualisations dans ta réponse via des blocs ```dataviz.
Chaque bloc contient un JSON avec deux parties :
  - "query" : une requête déclarative sur les données financières
  - "viz"   : la spécification de visualisation (type de graphique + mapping des channels)

Le backend exécute la query et fournit les données au frontend. Tu ne manipules JAMAIS les données directement.

=== MODES DE REQUÊTE ===

Il y a deux modes de requête :

1. MODE SIMPLE (liste de transactions) :
   Utilise "fields" pour sélectionner les colonnes. Pas de groupBy ni aggregates.
   Renvoie les transactions individuelles (lignes brutes).
```dataviz
{{
  "query": {{
    "source": "transactions",
    "fields": ["date", "label", "amount", "category.name"],
    "filters": [...],
    "orderBy": [{{"field": "date", "dir": "desc"}}],
    "limit": 20
  }},
  "viz": {{
    "chart": "table",
    "title": "Titre du tableau",
    "columns": [
      {{"field": "date", "label": "Date"}},
      {{"field": "label", "label": "Libellé"}},
      {{"field": "amount", "label": "Montant", "format": "currency"}},
      {{"field": "category_name", "label": "Catégorie"}}
    ]
  }}
}}
```

2. MODE AGRÉGATION (statistiques, graphiques) :
   Utilise "groupBy" et "aggregates". Pas de "fields".
```dataviz
{{
  "query": {{
    "source": "transactions",
    "filters": [{{"field": "...", "op": "...", "value": "..."}}],
    "groupBy": ["..."],
    "aggregates": [{{"fn": "sum", "field": "amount", "as": "total"}}],
    "orderBy": [{{"field": "total", "dir": "desc"}}],
    "limit": 10
  }},
  "viz": {{
    "chart": "bar|pie|area|kpi",
    "title": "Titre du graphique",
    "encoding": {{
      "x": {{"field": "...", "type": "nominal|quantitative|temporal"}},
      "y": {{"field": "...", "type": "quantitative", "format": "currency"}},
      "color": {{"field": "...", "type": "nominal"}}
    }}
  }}
}}
```

IMPORTANT : "fields" et "groupBy"/"aggregates" sont mutuellement exclusifs.
- Si l'utilisateur demande une LISTE de transactions → utilise "fields" + chart "table"
- Si l'utilisateur demande des STATISTIQUES ou un GRAPHIQUE → utilise "groupBy"/"aggregates" + chart bar/pie/area/kpi

IMPORTANT : dans "fields", utilise la notation source ("category.name", "account.name").
Dans "viz.columns", le champ "field" utilise le nom aplati ("category_name", "account_name") car c'est le nom de la colonne en sortie.

Types de graphiques disponibles :
- "table" : tableau de données (lignes individuelles, mode simple)
- "bar"   : barres (x=catégories, y=valeurs)
- "pie"   : camembert (theta=valeurs, color=catégories)
- "area"  : courbe d'évolution (x=temps, y=valeurs)
- "kpi"   : indicateurs clés (chaque ligne = un KPI avec label + value)

Encoding channels (pour bar/pie/area/kpi) :
- "x", "y"     : axes principaux
- "color"      : couleur / catégorie
- "theta"      : angle pour pie charts (valeur numérique)
- "label"      : étiquettes textuelles
- "value"      : valeur numérique (pour KPI)
- Chaque channel a: "field" (nom de colonne de la query), "type" (nominal|quantitative|temporal)
- Option "format": "currency" pour formater en euros

Table columns (pour chart "table") :
- "columns": liste de {{"field": "...", "label": "...", "format": "currency|..."}}
- "field" = nom de colonne en sortie (aplati: "category_name" au lieu de "category.name")

=== SCHEMA DES DONNÉES (metamodel) ===

{metamodel_schema}

=== COMPTES DE L'UTILISATEUR ===

{accounts_context}

=== EXEMPLES ===

Dernières transactions :
```dataviz
{{"query": {{"source": "transactions", "fields": ["date", "label", "amount", "category.name", "account.name"], "orderBy": [{{"field": "date", "dir": "desc"}}], "limit": 20}}, "viz": {{"chart": "table", "title": "Dernières opérations", "columns": [{{"field": "date", "label": "Date"}}, {{"field": "label", "label": "Libellé"}}, {{"field": "amount", "label": "Montant", "format": "currency"}}, {{"field": "category_name", "label": "Catégorie"}}, {{"field": "account_name", "label": "Compte"}}]}}}}
```

Dépenses par catégorie ce mois :
```dataviz
{{"query": {{"source": "transactions", "filters": [{{"field": "direction", "op": "=", "value": "expense"}}, {{"field": "date", "op": ">=", "value": "{example_date}"}}], "groupBy": ["category.name"], "aggregates": [{{"fn": "sum", "field": "amount", "as": "total"}}, {{"fn": "count", "as": "nb"}}], "orderBy": [{{"field": "total", "dir": "asc"}}], "limit": 10}}, "viz": {{"chart": "bar", "title": "Top dépenses par catégorie", "encoding": {{"x": {{"field": "category_name", "type": "nominal"}}, "y": {{"field": "total", "type": "quantitative", "format": "currency"}}}}}}}}
```

Recherche de transactions par libellé :
```dataviz
{{"query": {{"source": "transactions", "fields": ["date", "label", "amount", "category.name"], "filters": [{{"field": "label", "op": "like", "value": "amazon"}}], "orderBy": [{{"field": "date", "dir": "desc"}}], "limit": 20}}, "viz": {{"chart": "table", "title": "Transactions Amazon", "columns": [{{"field": "date", "label": "Date"}}, {{"field": "label", "label": "Libellé"}}, {{"field": "amount", "label": "Montant", "format": "currency"}}, {{"field": "category_name", "label": "Catégorie"}}]}}}}
```

Évolution du cashflow mensuel :
```dataviz
{{"query": {{"source": "transactions", "groupBy": ["month(date)"], "aggregates": [{{"fn": "sum", "field": "amount", "as": "net"}}], "orderBy": [{{"field": "month", "dir": "asc"}}]}}, "viz": {{"chart": "area", "title": "Évolution du solde net", "encoding": {{"x": {{"field": "month", "type": "temporal"}}, "y": {{"field": "net", "type": "quantitative", "format": "currency"}}}}}}}}
```

Solde par compte :
```dataviz
{{"query": {{"source": "balance"}}, "viz": {{"chart": "kpi", "title": "Soldes actuels", "encoding": {{"label": {{"field": "account_name", "type": "nominal"}}, "value": {{"field": "amount", "type": "quantitative", "format": "currency"}}}}}}}}
```

N'utilise les blocs dataviz que quand c'est pertinent pour illustrer ta réponse.
"""


# ---------------------------------------------------------------------------
# Dataviz block parser
# ---------------------------------------------------------------------------

_DATAVIZ_RE = re.compile(r"```dataviz\s*\n?([\s\S]*?)```", re.MULTILINE)


def parse_dataviz_blocks(text: str) -> list[tuple[str, dict]]:
    """Extract ```dataviz blocks from LLM response.

    Returns list of (matched_text, parsed_json) tuples.
    """
    blocks = []
    for match in _DATAVIZ_RE.finditer(text):
        raw = match.group(1).strip()
        try:
            parsed = json.loads(raw)
            if "query" in parsed and "viz" in parsed:
                blocks.append((match.group(0), parsed))
        except json.JSONDecodeError:
            logger.warning("dataviz_block_parse_error", raw=raw[:200])
    return blocks


def strip_dataviz_blocks(text: str) -> str:
    """Remove ```dataviz blocks from text, leaving surrounding prose."""
    return _DATAVIZ_RE.sub("", text).strip()


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class ChatService:
    """Orchestrates AI chat conversations with dataviz query engine."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.llm = get_llm_provider()

    async def chat(
        self,
        user: User,
        content: str,
        conversation_id: int | None = None,
        account_ids: list[int] | None = None,
        debug: bool = False,
    ) -> dict:
        """Process a chat message and return the AI response.

        Args:
            user: Current authenticated user.
            content: User message text.
            conversation_id: Existing conversation to continue, or None for new.
            account_ids: Account IDs selected in the UI (scope ceiling).
            debug: When True, collect and return debug traces.

        Returns:
            {
                "conversation_id": int,
                "message": str,
                "charts": [...],
                "metadata": {...},
                "debug": {...} | None
            }
        """
        # Resolve account scope
        scope_account_ids = await self._resolve_account_scope(user, account_ids)
        context = QueryContext(user_id=user.id, account_ids=scope_account_ids)

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

        # Build system prompt with metamodel + account context
        system_prompt = await self._build_system_prompt(user, scope_account_ids)

        # Build message history
        history = await self._get_message_history(conversation.id, limit=10)

        # Call LLM (timed)
        llm_start = time.monotonic()
        try:
            response_text = await self.llm.chat(
                system_prompt=system_prompt,
                messages=history,
                temperature=0.3,
            )
        except Exception as e:
            llm_duration_ms = (time.monotonic() - llm_start) * 1000
            error_msg = f"Erreur LLM ({type(self.llm).__name__}): {e}"
            logger.error("llm_call_error", error=str(e), provider=type(self.llm).__name__)

            result = {
                "conversation_id": conversation.id,
                "message": "",
                "charts": [],
                "metadata": {"provider": type(self.llm).__name__},
                "error": error_msg,
            }
            if debug:
                result["debug"] = {
                    "llm_raw_response": f"[ERREUR] {error_msg}",
                    "dataviz_blocks_found": 0,
                    "account_scope": scope_account_ids,
                    "block_traces": [],
                    "system_prompt_length": len(system_prompt),
                    "llm_duration_ms": round(llm_duration_ms, 1),
                    "error": error_msg,
                }
            return result

        llm_duration_ms = (time.monotonic() - llm_start) * 1000

        # Parse dataviz blocks and execute queries
        dataviz_blocks = parse_dataviz_blocks(response_text)
        charts = []
        block_traces = []

        for _block_text, block_data in dataviz_blocks:
            chart, trace = await self._execute_dataviz_block(
                block_data, context, collect_debug=debug
            )
            if chart:
                charts.append(chart)
            if trace:
                block_traces.append(trace)

        # Clean message text (remove dataviz blocks)
        clean_message = strip_dataviz_blocks(response_text)

        # Save assistant message
        assistant_msg = Message(
            conversation_id=conversation.id,
            role="assistant",
            content=response_text,  # store original with dataviz blocks
            metadata_={
                "charts": charts,
                "provider": type(self.llm).__name__,
            },
        )
        self.db.add(assistant_msg)

        # Update conversation title from first message
        if len(history) <= 1:
            conversation.title = content[:100]

        await self.db.flush()

        result = {
            "conversation_id": conversation.id,
            "message": clean_message,
            "charts": charts,
            "metadata": {
                "provider": type(self.llm).__name__,
            },
        }

        if debug:
            result["debug"] = {
                "llm_raw_response": response_text,
                "dataviz_blocks_found": len(dataviz_blocks),
                "account_scope": scope_account_ids,
                "block_traces": block_traces,
                "system_prompt_length": len(system_prompt),
                "llm_duration_ms": round(llm_duration_ms, 1),
            }

        return result

    async def _execute_dataviz_block(
        self, block: dict, context: QueryContext, collect_debug: bool = False
    ) -> tuple[dict | None, dict | None]:
        """Execute a single dataviz block: run query, return (chart, debug_trace).

        Always returns a debug trace (even without debug flag) for error blocks,
        so the caller can decide what to surface.

        Returns:
            (chart_dict_or_None, debug_trace_dict_or_None)
        """
        query_spec = block.get("query", {})
        viz_spec = block.get("viz", {})

        start = time.monotonic()
        try:
            data, _col_names, sql_text = await execute_query(
                self.db, query_spec, context
            )
            duration_ms = (time.monotonic() - start) * 1000

            trace = None
            if collect_debug:
                trace = {
                    "query": query_spec,
                    "viz": viz_spec,
                    "sql": sql_text,
                    "row_count": len(data),
                    "data_sample": data[:5],
                    "error": None,
                    "duration_ms": round(duration_ms, 1),
                }

            return {"viz": viz_spec, "data": data}, trace

        except QueryValidationError as e:
            logger.warning("dataviz_query_validation_error", error=str(e))
            duration_ms = (time.monotonic() - start) * 1000
            trace = {
                "query": query_spec,
                "viz": viz_spec,
                "sql": None,
                "row_count": None,
                "data_sample": [],
                "error": f"Validation: {e}",
                "duration_ms": round(duration_ms, 1),
            }
            return None, trace

        except QueryExecutionError as e:
            logger.error("dataviz_query_execution_error", error=str(e), sql=e.sql)
            duration_ms = (time.monotonic() - start) * 1000
            trace = {
                "query": e.query_dsl or query_spec,
                "viz": viz_spec,
                "sql": e.sql,
                "row_count": None,
                "data_sample": [],
                "error": str(e),
                "duration_ms": round(duration_ms, 1),
            }
            return None, trace

        except Exception as e:
            logger.error("dataviz_query_unexpected_error", error=str(e))
            duration_ms = (time.monotonic() - start) * 1000
            trace = {
                "query": query_spec,
                "viz": viz_spec,
                "sql": None,
                "row_count": None,
                "data_sample": [],
                "error": f"Erreur inattendue: {type(e).__name__}: {e}",
                "duration_ms": round(duration_ms, 1),
            }
            return None, trace

    async def _resolve_account_scope(
        self, user: User, account_ids: list[int] | None
    ) -> list[int]:
        """Resolve the account scope ceiling.

        If account_ids provided, intersect with user's actual accounts.
        If None, use all user accounts.
        """
        result = await self.db.execute(
            select(Account.id).where(
                Account.user_id == user.id,
                Account.status == "active",
            )
        )
        all_user_accounts = [r for r in result.scalars().all()]

        if account_ids:
            return [aid for aid in account_ids if aid in all_user_accounts]

        return all_user_accounts

    async def _build_system_prompt(
        self, user: User, account_ids: list[int]
    ) -> str:
        """Build the system prompt with metamodel schema and account context."""
        result = await self.db.execute(
            select(Account).where(Account.id.in_(account_ids))
        )
        accounts = result.scalars().all()

        accounts_context = "\n".join(
            f"- {acc.name} ({acc.type}, {acc.bank_name or 'N/A'})"
            for acc in accounts
        )
        if not accounts_context:
            accounts_context = "Aucun compte sélectionné."

        from datetime import date as date_type
        today = date_type.today()
        example_date = today.replace(day=1).isoformat()

        return _SYSTEM_PROMPT_TEMPLATE.format(
            metamodel_schema=metamodel_prompt_text(),
            accounts_context=accounts_context,
            example_date=example_date,
        )

    # ---- conversation management ----

    async def list_conversations(self, user: User) -> list[Conversation]:
        result = await self.db.execute(
            select(Conversation)
            .where(Conversation.user_id == user.id)
            .order_by(Conversation.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_conversation(
        self, conversation_id: int, user: User
    ) -> Conversation | None:
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
        conv = await self.get_conversation(conversation_id, user)
        if not conv:
            return False
        await self.db.delete(conv)
        await self.db.flush()
        return True

    async def check_provider_status(self) -> dict:
        available = await self.llm.is_available()
        return {
            "provider": type(self.llm).__name__,
            "available": available,
        }

    async def _get_or_create_conversation(
        self, user: User, conversation_id: int | None
    ) -> Conversation:
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
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        messages = list(result.scalars().all())
        messages.reverse()

        return [
            {"role": msg.role, "content": msg.content}
            for msg in messages
            if msg.role in ("user", "assistant")
        ]
