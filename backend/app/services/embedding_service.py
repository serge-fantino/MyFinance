"""Embedding-based transaction classification service.

Uses sentence-transformers (local, no GPU required) to compute embeddings
for transaction labels, then uses cosine similarity and AgglomerativeClustering
to group similar transactions and suggest categories.

Category names are also projected into the embedding space to provide
semantic suggestions even without user-classified reference data.
"""

import numpy as np
import structlog
from sentence_transformers import SentenceTransformer
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.account import Account
from app.services.label_parser import get_embedding_text
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User

logger = structlog.get_logger()

# ── Singleton model loader ──────────────────────────────

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    """Lazy-load the sentence-transformers model (singleton)."""
    global _model
    if _model is None:
        logger.info("loading_embedding_model", model=settings.embedding_model_name)
        _model = SentenceTransformer(settings.embedding_model_name)
        logger.info("embedding_model_loaded", model=settings.embedding_model_name)
    return _model


# ── Public service ──────────────────────────────────────


class EmbeddingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Embedding computation ───────────────────────────

    @staticmethod
    def compute_embedding(text: str) -> list[float]:
        """Compute embedding for a single text string."""
        model = _get_model()
        embedding = model.encode(text, normalize_embeddings=True)
        return embedding.tolist()

    @staticmethod
    def compute_embeddings_batch(texts: list[str]) -> list[list[float]]:
        """Compute embeddings for a batch of texts (more efficient)."""
        if not texts:
            return []
        model = _get_model()
        embeddings = model.encode(texts, normalize_embeddings=True, batch_size=64)
        return embeddings.tolist()

    @staticmethod
    def _build_embedding_text(
        label_raw: str, amount_sign: str, parsed_metadata: dict | None = None
    ) -> str:
        """Build the text to embed for a transaction.

        Uses the cleaned counterparty from parsed_metadata when available,
        since the counterparty is the most semantically relevant part.
        Falls back to the full label_raw otherwise.

        A direction tag [income/expense] is appended to help distinguish
        transactions with similar labels but different natures.
        """
        base_text = get_embedding_text(parsed_metadata, label_raw)
        return f"{base_text} [{amount_sign}]"

    # ── Ensure embeddings exist ─────────────────────────

    async def compute_missing_embeddings(
        self,
        user: User,
        account_id: int | None = None,
    ) -> dict:
        """Compute embeddings for transactions that don't have one yet.

        Returns {computed, skipped, total}.
        """
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        query = select(Transaction).where(
            Transaction.account_id.in_(user_accounts),
            Transaction.deleted_at.is_(None),
            Transaction.embedding.is_(None),
        )
        if account_id:
            query = query.where(Transaction.account_id == account_id)

        result = await self.db.execute(query)
        transactions = list(result.scalars().all())

        if not transactions:
            return {"computed": 0, "skipped": 0, "total": 0}

        # Build texts for batch encoding
        texts = []
        for txn in transactions:
            direction = "income" if txn.amount >= 0 else "expense"
            texts.append(
                self._build_embedding_text(txn.label_raw, direction, txn.parsed_metadata)
            )

        # Compute embeddings in batch
        embeddings = self.compute_embeddings_batch(texts)

        # Store embeddings
        for txn, emb in zip(transactions, embeddings):
            txn.embedding = emb

        await self.db.flush()

        logger.info(
            "embeddings_computed",
            user_id=user.id,
            computed=len(transactions),
            account_id=account_id,
        )

        return {
            "computed": len(transactions),
            "skipped": 0,
            "total": len(transactions),
        }

    # ── Category embeddings ─────────────────────────────

    async def _get_category_embeddings(self, user: User) -> list[dict]:
        """Compute embeddings for all available categories.

        Returns list of {id, name, parent_name, full_path, embedding}.
        Category embeddings are computed on-the-fly (fast: ~18 categories).
        """
        result = await self.db.execute(
            select(Category)
            .where(
                or_(Category.is_system.is_(True), Category.user_id == user.id)
            )
            .order_by(Category.parent_id.nulls_first(), Category.name)
        )
        all_cats = list(result.scalars().all())
        cat_map = {c.id: c for c in all_cats}

        # Build full paths for leaf categories (ones with no children)
        parent_ids = {c.parent_id for c in all_cats if c.parent_id}
        leaf_cats = []
        for c in all_cats:
            # Include both leaf and parent categories for matching
            parent_name = cat_map[c.parent_id].name if c.parent_id and c.parent_id in cat_map else None
            full_path = f"{parent_name} > {c.name}" if parent_name else c.name
            leaf_cats.append({
                "id": c.id,
                "name": c.name,
                "parent_name": parent_name,
                "full_path": full_path,
                "is_leaf": c.id not in parent_ids,
            })

        # Compute embeddings for category paths
        texts = [c["full_path"] for c in leaf_cats]
        embeddings = self.compute_embeddings_batch(texts)

        for cat, emb in zip(leaf_cats, embeddings):
            cat["embedding"] = emb

        return leaf_cats

    # ── Similarity search ───────────────────────────────

    async def _get_classified_transactions_with_embeddings(
        self,
        user: User,
        account_id: int | None = None,
    ) -> list[Transaction]:
        """Fetch classified transactions that have embeddings."""
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        query = select(Transaction).where(
            Transaction.account_id.in_(user_accounts),
            Transaction.deleted_at.is_(None),
            Transaction.category_id.is_not(None),
            Transaction.embedding.is_not(None),
        )
        if account_id:
            query = query.where(Transaction.account_id == account_id)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def suggest_category_for_transaction(
        self,
        transaction: Transaction,
        user: User,
    ) -> dict | None:
        """Suggest a category for a single transaction based on embeddings.

        Returns {category_id, category_name, confidence, source} or None.
        source is 'similar_transactions' or 'category_semantics'.
        """
        if transaction.embedding is None:
            return None

        txn_emb = np.array(transaction.embedding).reshape(1, -1)

        # Strategy 1: k-NN on classified transactions
        classified = await self._get_classified_transactions_with_embeddings(user)
        if classified:
            suggestion = await self._suggest_from_neighbors(txn_emb, classified)
            if suggestion:
                return suggestion

        # Strategy 2: Semantic match against category embeddings
        return await self._suggest_from_categories(txn_emb, user)

    async def _suggest_from_neighbors(
        self,
        txn_emb: np.ndarray,
        classified: list[Transaction],
    ) -> dict | None:
        """Suggest category from nearest classified transactions (k-NN)."""
        if not classified:
            return None

        # Build matrix of classified embeddings
        classified_embs = np.array([list(t.embedding) for t in classified])
        similarities = cosine_similarity(txn_emb, classified_embs)[0]

        # Get top-K neighbors
        k = min(5, len(classified))
        top_indices = np.argsort(similarities)[-k:][::-1]
        best_sim = similarities[top_indices[0]]

        # Check threshold
        if best_sim < settings.embedding_similarity_low:
            return None

        # Weighted vote among top-K neighbors
        category_scores: dict[int, float] = {}
        for idx in top_indices:
            sim = similarities[idx]
            if sim < settings.embedding_similarity_low:
                break
            cat_id = classified[idx].category_id
            category_scores[cat_id] = category_scores.get(cat_id, 0.0) + sim

        best_cat_id = max(category_scores, key=category_scores.get)

        # Determine confidence level
        if best_sim >= settings.embedding_similarity_high:
            confidence = "high"
        elif best_sim >= settings.embedding_similarity_medium:
            confidence = "medium"
        else:
            confidence = "low"

        # Fetch category name
        cat = await self.db.get(Category, best_cat_id)
        cat_name = cat.name if cat else None

        return {
            "category_id": best_cat_id,
            "category_name": cat_name,
            "confidence": confidence,
            "similarity": float(best_sim),
            "source": "similar_transactions",
        }

    async def _suggest_from_categories(
        self,
        txn_emb: np.ndarray,
        user: User,
    ) -> dict | None:
        """Suggest category from semantic similarity to category names."""
        cat_embeddings = await self._get_category_embeddings(user)

        # Only consider leaf categories for suggestions
        leaf_cats = [c for c in cat_embeddings if c["is_leaf"]]
        if not leaf_cats:
            return None

        cat_embs = np.array([c["embedding"] for c in leaf_cats])
        similarities = cosine_similarity(txn_emb, cat_embs)[0]

        best_idx = np.argmax(similarities)
        best_sim = similarities[best_idx]

        if best_sim < settings.embedding_category_threshold:
            return None

        best_cat = leaf_cats[best_idx]

        # Category semantic matches are capped at "medium" confidence
        if best_sim >= settings.embedding_similarity_medium:
            confidence = "medium"
        else:
            confidence = "low"

        return {
            "category_id": best_cat["id"],
            "category_name": best_cat["name"],
            "confidence": confidence,
            "similarity": float(best_sim),
            "source": "category_semantics",
        }

    # ── Clustering ──────────────────────────────────────

    async def get_clusters(
        self,
        user: User,
        account_id: int | None = None,
        min_cluster_size: int | None = None,
    ) -> dict:
        """Cluster uncategorized transactions and suggest categories.

        Returns {clusters: [...], unclustered_count, total_uncategorized}.
        Each cluster has: {cluster_id, transaction_count, sample_transactions,
        suggested_category_id, suggested_category_name, suggestion_confidence,
        suggestion_source, representative_label}.
        """
        if min_cluster_size is None:
            min_cluster_size = settings.embedding_min_cluster_size

        # Fetch uncategorized transactions with embeddings
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        query = select(Transaction).where(
            Transaction.account_id.in_(user_accounts),
            Transaction.deleted_at.is_(None),
            Transaction.category_id.is_(None),
            Transaction.embedding.is_not(None),
        )
        if account_id:
            query = query.where(Transaction.account_id == account_id)

        result = await self.db.execute(query)
        uncategorized = list(result.scalars().all())

        if not uncategorized:
            return {
                "clusters": [],
                "unclustered_count": 0,
                "total_uncategorized": 0,
            }

        # Count those without embeddings too
        count_query = select(Transaction.id).where(
            Transaction.account_id.in_(user_accounts),
            Transaction.deleted_at.is_(None),
            Transaction.category_id.is_(None),
        )
        if account_id:
            count_query = count_query.where(Transaction.account_id == account_id)
        total_result = await self.db.execute(count_query)
        total_uncategorized = len(total_result.all())

        if len(uncategorized) < min_cluster_size:
            # Not enough data for clustering — return individual suggestions
            return {
                "clusters": [],
                "unclustered_count": len(uncategorized),
                "total_uncategorized": total_uncategorized,
            }

        # Build embedding matrix (float64)
        embeddings = np.asarray(
            [np.asarray(t.embedding, dtype=np.float64).ravel() for t in uncategorized],
            dtype=np.float64,
        )

        # Cosine distance matrix (sklearn HDBSCAN has a bug with 0-dim arrays, use AgglomerativeClustering)
        sim_matrix = cosine_similarity(embeddings)
        distance_matrix = np.clip(1.0 - sim_matrix, 0.0, 2.0)
        np.fill_diagonal(distance_matrix, 0.0)
        distance_matrix = np.ascontiguousarray(distance_matrix.astype(np.float64))

        clusterer = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=0.5,
            metric="precomputed",
            linkage="average",
        )
        labels = clusterer.fit_predict(distance_matrix)

        # Enforce min_cluster_size: treat small clusters as noise (label -1)
        min_size = int(min_cluster_size)
        unique, counts = np.unique(labels, return_counts=True)
        small_labels = {u for u, c in zip(unique, counts) if c < min_size}
        labels = np.array([-1 if l in small_labels else l for l in labels])

        # Group transactions by cluster
        cluster_map: dict[int, list[int]] = {}
        unclustered_indices = []
        for idx, label in enumerate(labels):
            if label == -1:
                unclustered_indices.append(idx)
            else:
                cluster_map.setdefault(label, []).append(idx)

        # Get classified transactions for suggestion via neighbors
        classified = await self._get_classified_transactions_with_embeddings(user, account_id)
        cat_embeddings = await self._get_category_embeddings(user)

        # Build cluster response
        clusters = []
        for cluster_id, indices in sorted(cluster_map.items(), key=lambda x: -len(x[1])):
            cluster_txns = [uncategorized[i] for i in indices]

            # Centroid embedding
            cluster_embs = embeddings[indices]
            centroid = cluster_embs.mean(axis=0).reshape(1, -1)

            # Representative label: prefer counterparty from parsed metadata
            label_counts: dict[str, int] = {}
            for txn in cluster_txns:
                counterparty = (
                    txn.parsed_metadata.get("counterparty")
                    if txn.parsed_metadata
                    else None
                )
                display_label = counterparty or txn.label_raw
                label_counts[display_label] = label_counts.get(display_label, 0) + 1
            representative_label = max(label_counts, key=label_counts.get)

            # Suggest category for the cluster centroid
            suggestion = None

            # Strategy 1: k-NN on classified transactions
            if classified:
                suggestion = await self._suggest_from_neighbors(centroid, classified)

            # Strategy 2: Semantic match against categories
            if suggestion is None:
                leaf_cats = [c for c in cat_embeddings if c["is_leaf"]]
                if leaf_cats:
                    cat_embs = np.array([c["embedding"] for c in leaf_cats])
                    sims = cosine_similarity(centroid, cat_embs)[0]
                    best_idx = np.argmax(sims)
                    best_sim = sims[best_idx]
                    if best_sim >= settings.embedding_category_threshold:
                        best_cat = leaf_cats[best_idx]
                        confidence = "medium" if best_sim >= settings.embedding_similarity_medium else "low"
                        suggestion = {
                            "category_id": best_cat["id"],
                            "category_name": best_cat["name"],
                            "confidence": confidence,
                            "similarity": float(best_sim),
                            "source": "category_semantics",
                        }

            # Sample transactions (up to 5)
            sample_txns = [
                {
                    "id": txn.id,
                    "label_raw": txn.label_raw,
                    "amount": float(txn.amount),
                    "date": txn.date.isoformat(),
                }
                for txn in cluster_txns[:5]
            ]

            clusters.append({
                "cluster_id": cluster_id,
                "transaction_count": len(cluster_txns),
                "transaction_ids": [txn.id for txn in cluster_txns],
                "sample_transactions": sample_txns,
                "representative_label": representative_label,
                "suggested_category_id": suggestion["category_id"] if suggestion else None,
                "suggested_category_name": suggestion["category_name"] if suggestion else None,
                "suggestion_confidence": suggestion["confidence"] if suggestion else None,
                "suggestion_similarity": suggestion["similarity"] if suggestion else None,
                "suggestion_source": suggestion["source"] if suggestion else None,
            })

        logger.info(
            "clustering_complete",
            user_id=user.id,
            clusters=len(clusters),
            unclustered=len(unclustered_indices),
            total_uncategorized=total_uncategorized,
        )

        return {
            "clusters": clusters,
            "unclustered_count": len(unclustered_indices),
            "total_uncategorized": total_uncategorized,
        }

    # ── Batch classification ────────────────────────────

    async def classify_transactions(
        self,
        transaction_ids: list[int],
        category_id: int,
        user: User,
        custom_label: str | None = None,
        create_rule: bool = True,
        rule_pattern: str | None = None,
    ) -> dict:
        """Classify a set of transactions (typically a cluster).

        Optionally creates a classification rule for future transactions.
        Returns {classified_count, rule_created}.
        """
        from app.services.rule_service import RuleService

        # Verify category exists
        cat = await self.db.get(Category, category_id)
        if not cat:
            return {"classified_count": 0, "rule_created": False}

        # Fetch and verify transactions belong to user
        user_accounts = select(Account.id).where(Account.user_id == user.id)
        result = await self.db.execute(
            select(Transaction).where(
                Transaction.id.in_(transaction_ids),
                Transaction.account_id.in_(user_accounts),
                Transaction.deleted_at.is_(None),
            )
        )
        transactions = list(result.scalars().all())

        # Apply classification
        for txn in transactions:
            txn.category_id = category_id
            txn.ai_confidence = "user"
            if custom_label:
                txn.label_clean = custom_label

        # Create rule if requested
        rule_created = False
        if create_rule and transactions:
            rule_service = RuleService(self.db)
            pattern = rule_pattern or transactions[0].label_raw
            await rule_service.create_rule_from_transaction(
                user=user,
                label_raw=pattern,
                category_id=category_id,
                custom_label=custom_label,
                pattern_override=rule_pattern,
            )
            rule_created = True

        await self.db.flush()

        logger.info(
            "cluster_classified",
            user_id=user.id,
            classified_count=len(transactions),
            category_id=category_id,
            rule_created=rule_created,
        )

        return {
            "classified_count": len(transactions),
            "rule_created": rule_created,
        }
