"""AI service for transaction classification.

Uses OpenAI to classify bank transactions into categories.
Supports batch classification and a feedback loop where user
corrections improve future predictions.
"""

import json
from decimal import Decimal

import structlog
from openai import AsyncOpenAI
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User

logger = structlog.get_logger()

# Maximum transactions per OpenAI call (to stay within token limits)
BATCH_SIZE = 30


class AIClassificationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            if not settings.openai_api_key:
                raise RuntimeError(
                    "OPENAI_API_KEY is not configured. "
                    "Set it in your .env file to enable AI classification."
                )
            self._client = AsyncOpenAI(api_key=settings.openai_api_key)
        return self._client

    # ── Public API ─────────────────────────────────────

    async def classify_uncategorized(
        self,
        user: User,
        account_id: int | None = None,
        limit: int = 200,
    ) -> dict:
        """Classify all uncategorized transactions for a user.

        Returns a summary: {classified, failed, skipped, total}.
        """
        from app.models.account import Account

        # Fetch uncategorized transactions
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        query = (
            select(Transaction)
            .where(
                Transaction.account_id.in_(user_accounts),
                Transaction.category_id.is_(None),
                Transaction.deleted_at.is_(None),
            )
            .order_by(Transaction.date.desc())
            .limit(limit)
        )
        if account_id:
            query = query.where(Transaction.account_id == account_id)

        result = await self.db.execute(query)
        transactions = list(result.scalars().all())

        if not transactions:
            return {"classified": 0, "failed": 0, "skipped": 0, "total": 0}

        # Build context
        categories = await self._get_flat_categories(user)
        examples = await self._get_user_examples(user, max_examples=30)
        rules = await self._get_user_rules(user)

        # Process in batches
        classified = 0
        failed = 0

        for i in range(0, len(transactions), BATCH_SIZE):
            batch = transactions[i : i + BATCH_SIZE]
            try:
                predictions = await self._classify_batch(batch, categories, examples, rules)
                classified += await self._apply_predictions(batch, predictions)
            except Exception as e:
                logger.error("ai_classification_batch_failed", error=str(e), batch_start=i)
                failed += len(batch)

        await self.db.flush()

        return {
            "classified": classified,
            "failed": failed,
            "skipped": 0,
            "total": len(transactions),
        }

    async def classify_single(
        self,
        transaction: Transaction,
        user: User,
    ) -> dict | None:
        """Classify a single transaction. Returns {category_id, confidence} or None."""
        categories = await self._get_flat_categories(user)
        examples = await self._get_user_examples(user, max_examples=15)

        try:
            predictions = await self._classify_batch([transaction], categories, examples)
            if predictions:
                return predictions[0]
        except Exception as e:
            logger.error("ai_classify_single_failed", error=str(e), txn_id=transaction.id)
        return None

    # ── Private helpers ────────────────────────────────

    async def _get_flat_categories(self, user: User) -> list[dict]:
        """Get a flat list of leaf categories (the ones we want to assign)."""
        result = await self.db.execute(
            select(Category)
            .where(
                or_(Category.is_system.is_(True), Category.user_id == user.id)
            )
            .order_by(Category.parent_id.nulls_first(), Category.name)
        )
        all_cats = list(result.scalars().all())

        # Build parent name map
        cat_map = {c.id: c for c in all_cats}
        flat = []
        for c in all_cats:
            parent_name = cat_map[c.parent_id].name if c.parent_id and c.parent_id in cat_map else None
            flat.append({
                "id": c.id,
                "name": c.name,
                "parent": parent_name,
            })
        return flat

    async def _get_user_examples(self, user: User, max_examples: int = 30) -> list[dict]:
        """Get recent manually-categorized transactions as few-shot examples.

        These are transactions where the user explicitly set a category
        (source != 'ai' for the category assignment, or ai_confidence is null
        meaning it was set manually).
        """
        from app.models.account import Account

        user_accounts = select(Account.id).where(Account.user_id == user.id)

        result = await self.db.execute(
            select(Transaction)
            .where(
                Transaction.account_id.in_(user_accounts),
                Transaction.category_id.is_not(None),
                Transaction.deleted_at.is_(None),
                # Prefer user-corrected transactions (no ai_confidence = manual)
                or_(
                    Transaction.ai_confidence.is_(None),
                    Transaction.ai_confidence == "user",
                ),
            )
            .order_by(Transaction.updated_at.desc())
            .limit(max_examples)
        )
        transactions = result.scalars().all()

        examples = []
        for txn in transactions:
            cat = await self.db.get(Category, txn.category_id)
            if cat:
                examples.append({
                    "label": txn.label_raw,
                    "amount": float(txn.amount),
                    "category": cat.name,
                    "category_id": cat.id,
                })
        return examples

    async def _get_user_rules(self, user: User) -> list[dict]:
        """Get active classification rules as AI context."""
        from app.models.classification_rule import ClassificationRule

        result = await self.db.execute(
            select(ClassificationRule).where(
                ClassificationRule.user_id == user.id,
                ClassificationRule.is_active.is_(True),
            ).order_by(ClassificationRule.priority.desc())
        )
        rules = result.scalars().all()

        rule_list = []
        for r in rules:
            cat = await self.db.get(Category, r.category_id)
            rule_list.append({
                "pattern": r.pattern,
                "match_type": r.match_type,
                "category": cat.name if cat else "?",
                "category_id": r.category_id,
                "custom_label": r.custom_label,
            })
        return rule_list

    async def _classify_batch(
        self,
        transactions: list[Transaction],
        categories: list[dict],
        examples: list[dict],
        rules: list[dict] | None = None,
    ) -> list[dict]:
        """Call OpenAI to classify a batch of transactions.

        Returns a list of {transaction_id, category_id, confidence}.
        """
        # Build the category list for the prompt
        cat_lines = []
        for c in categories:
            if c["parent"]:
                cat_lines.append(f'  - id={c["id"]}: {c["parent"]} > {c["name"]}')
            else:
                cat_lines.append(f'  - id={c["id"]}: {c["name"]}')
        cat_text = "\n".join(cat_lines)

        # Build few-shot examples
        example_text = ""
        if examples:
            ex_lines = []
            for ex in examples[:20]:
                sign = "+" if ex["amount"] >= 0 else ""
                ex_lines.append(
                    f'  "{ex["label"]}" ({sign}{ex["amount"]:.2f}) → {ex["category"]} (id={ex["category_id"]})'
                )
            example_text = (
                "\nExemples de classifications précédentes de cet utilisateur :\n"
                + "\n".join(ex_lines)
                + "\n"
            )

        # Build rules context
        rules_text = ""
        if rules:
            rule_lines = []
            for r in rules:
                label_info = f' (libellé: "{r["custom_label"]}")' if r["custom_label"] else ""
                rule_lines.append(
                    f'  - Si le libellé {r["match_type"]} "{r["pattern"]}" → {r["category"]} (id={r["category_id"]}){label_info}'
                )
            rules_text = (
                "\nRègles de classification définies par l'utilisateur :\n"
                + "\n".join(rule_lines)
                + "\nUtilise ces règles comme référence pour comprendre les préférences de l'utilisateur.\n"
            )

        # Build transaction list
        txn_lines = []
        for txn in transactions:
            sign = "+" if txn.amount >= 0 else ""
            txn_lines.append(
                f'  {{"id": {txn.id}, "label": "{txn.label_raw}", "amount": {sign}{txn.amount:.2f}}}'
            )
        txn_text = "\n".join(txn_lines)

        system_prompt = (
            "Tu es un assistant spécialisé dans la classification de transactions bancaires. "
            "Tu reçois une liste de transactions et tu dois les classer dans les catégories fournies.\n\n"
            "Règles :\n"
            "- Assigne UNIQUEMENT des category_id existants dans la liste ci-dessous.\n"
            "- Privilégie les sous-catégories (feuilles) plutôt que les catégories parentes.\n"
            "- Si une transaction est un crédit (montant positif), c'est probablement un revenu.\n"
            "- Si une transaction est un débit (montant négatif), c'est probablement une dépense.\n"
            "- Un virement entre comptes peut être un crédit ou un débit.\n"
            "- Indique ta confiance : high (très sûr), medium (probable), low (incertain).\n"
            "- Réponds UNIQUEMENT en JSON, sans markdown ni commentaire.\n\n"
            f"Catégories disponibles :\n{cat_text}\n"
            f"{rules_text}"
            f"{example_text}"
        )

        user_prompt = (
            "Classifie ces transactions. Réponds avec un tableau JSON :\n"
            '[{"id": <transaction_id>, "category_id": <id>, "confidence": "high"|"medium"|"low"}]\n\n'
            f"Transactions :\n{txn_text}"
        )

        response = await self.client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        # Parse response
        raw = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)

        # The model might wrap in a key like "classifications" or return a list directly
        if isinstance(parsed, list):
            predictions = parsed
        elif isinstance(parsed, dict):
            # Find the first list value in the dict
            predictions = []
            for v in parsed.values():
                if isinstance(v, list):
                    predictions = v
                    break

        logger.info(
            "ai_classification_batch",
            txn_count=len(transactions),
            predictions_count=len(predictions),
        )

        return predictions

    async def _apply_predictions(
        self,
        transactions: list[Transaction],
        predictions: list[dict],
    ) -> int:
        """Apply AI predictions to transactions. Returns count of applied."""
        # Build lookup
        txn_map = {t.id: t for t in transactions}

        # Validate category IDs exist
        valid_cat_ids = set()
        result = await self.db.execute(select(Category.id))
        for row in result:
            valid_cat_ids.add(row[0])

        applied = 0
        for pred in predictions:
            txn_id = pred.get("id")
            cat_id = pred.get("category_id")
            confidence = pred.get("confidence", "low")

            if txn_id not in txn_map:
                continue
            if cat_id not in valid_cat_ids:
                logger.warning("ai_invalid_category", txn_id=txn_id, category_id=cat_id)
                continue

            txn = txn_map[txn_id]
            txn.category_id = cat_id
            txn.ai_confidence = confidence
            applied += 1

        return applied
