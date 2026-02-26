"""Classification proposal service.

Manages one proposal per (user, account). Recalculates via embedding service.
"""

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.account import Account
from app.models.classification_proposal import ClassificationProposal, ClassificationProposalCluster
from app.models.user import User

logger = structlog.get_logger()


class ClassificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_proposal(self, user: User, account_id: int) -> dict | None:
        """Get the classification proposal for an account, or None if none exists."""
        result = await self.db.execute(
            select(ClassificationProposal)
            .where(
                ClassificationProposal.user_id == user.id,
                ClassificationProposal.account_id == account_id,
            )
            .options(selectinload(ClassificationProposal.clusters))
        )
        proposal = result.scalar_one_or_none()
        if not proposal:
            return None
        return self._proposal_to_dict(proposal)

    def _proposal_to_dict(self, proposal: ClassificationProposal) -> dict:
        """Convert proposal model to API response dict."""
        clusters = []
        for i, c in enumerate(proposal.clusters):
            clusters.append({
                "cluster_id": c.id,
                "transaction_count": c.transaction_count,
                "total_amount_abs": float(c.total_amount_abs),
                "transaction_ids": c.transaction_ids,
                "sample_transactions": c.transactions[:5] if c.transactions else [],
                "transactions": c.transactions or [],
                "representative_label": c.representative_label,
                "suggested_category_id": c.suggested_category_id,
                "suggested_category_name": c.suggested_category_name,
                "suggestion_confidence": c.suggestion_confidence,
                "suggestion_similarity": None,
                "suggestion_source": c.suggestion_source,
                "suggestion_explanation": c.suggestion_explanation,
                "status": c.status,
                "override_category_id": c.override_category_id,
                "rule_pattern": c.rule_pattern or "",
                "custom_label": c.custom_label or "",
                "excluded_ids": c.excluded_ids or [],
                "transaction_cluster_id": c.transaction_cluster_id,
            })
        return {
            "account_id": proposal.account_id,
            "distance_threshold": proposal.distance_threshold,
            "total_uncategorized": proposal.total_uncategorized,
            "unclustered_count": proposal.unclustered_count,
            "clusters": clusters,
        }

    async def recalculate(self, user: User, account_id: int, distance_threshold: float) -> dict:
        """Recalculate classification: apply rules first, then parse labels, compute embeddings, cluster.

        EVOL-001: Rules only classify (set category_id). They no longer auto-create clusters.
        For rules with cluster_id, linked ProposalClusters are created so the user can
        review and confirm the merge into the existing TransactionCluster.
        """
        from app.models.classification_rule import ClassificationRule
        from app.models.transaction import Transaction
        from app.models.transaction_cluster import TransactionCluster
        from app.services.embedding_service import EmbeddingService
        from app.services.label_parser import parse_label
        from app.services.rule_service import RuleService

        # Verify account belongs to user
        account = await self.db.get(Account, account_id)
        if not account or account.user_id != user.id:
            raise ValueError("Account not found or access denied")

        # Apply rules first — only classifies, returns rule_matches for linked proposals
        rule_service = RuleService(self.db)
        rule_result = await rule_service.apply_rules(user, account_id)
        rule_matches = rule_result.get("rule_matches", {})

        # Parse labels
        query = select(Transaction).where(
            Transaction.account_id == account_id,
            Transaction.deleted_at.is_(None),
            Transaction.parsed_metadata.is_(None),
        )
        result = await self.db.execute(query)
        for txn in result.scalars().all():
            metadata = parse_label(txn.label_raw)
            txn.parsed_metadata = metadata
            txn.embedding = None
        await self.db.flush()

        # Compute embeddings
        embedding_service = EmbeddingService(self.db)
        await embedding_service.compute_missing_embeddings(user, account_id)

        # Get clusters (embedding-based, for uncategorized transactions)
        clusters_data = await embedding_service.get_clusters(
            user, account_id, None, distance_threshold
        )

        # Build linked ProposalClusters for rules that have cluster_id
        linked_clusters = []
        if rule_matches:
            # Load rules that have cluster_id set
            rule_ids_with_matches = list(rule_matches.keys())
            rules_result = await self.db.execute(
                select(ClassificationRule).where(
                    ClassificationRule.id.in_(rule_ids_with_matches),
                    ClassificationRule.cluster_id.isnot(None),
                )
            )
            linked_rules = list(rules_result.scalars().all())

            for rule in linked_rules:
                matched_txn_ids = rule_matches.get(rule.id, [])
                if not matched_txn_ids:
                    continue

                # Load the TransactionCluster to get its name
                tc = await self.db.get(TransactionCluster, rule.cluster_id)
                if not tc:
                    continue

                # Load matched transactions for display
                txn_result = await self.db.execute(
                    select(Transaction).where(Transaction.id.in_(matched_txn_ids))
                )
                txns = list(txn_result.scalars().all())
                txn_data = [
                    {
                        "id": t.id,
                        "label_raw": t.label_raw,
                        "amount": float(t.amount),
                        "date": t.date.isoformat(),
                    }
                    for t in txns
                ]
                total_abs = sum(abs(float(t.amount)) for t in txns)

                linked_clusters.append({
                    "representative_label": tc.name,
                    "transaction_ids": matched_txn_ids,
                    "transactions": txn_data,
                    "transaction_count": len(matched_txn_ids),
                    "total_amount_abs": total_abs,
                    "suggested_category_id": tc.category_id,
                    "suggested_category_name": None,
                    "suggestion_confidence": "rule",
                    "suggestion_source": "rule_linked",
                    "suggestion_explanation": f"Matched by rule '{rule.pattern}' → cluster '{tc.name}'",
                    # EVOL-001: link to existing TC
                    "transaction_cluster_id": tc.id,
                    "rule_pattern": rule.pattern,
                })

                # Resolve category name for display
                if tc.category_id:
                    from app.models.category import Category
                    cat = await self.db.get(Category, tc.category_id)
                    if cat:
                        linked_clusters[-1]["suggested_category_name"] = cat.name

        # Upsert proposal: delete old clusters, create new proposal with clusters
        existing = await self.db.execute(
            select(ClassificationProposal)
            .where(
                ClassificationProposal.user_id == user.id,
                ClassificationProposal.account_id == account_id,
            )
            .options(selectinload(ClassificationProposal.clusters))
        )
        proposal = existing.scalar_one_or_none()
        if proposal:
            for c in proposal.clusters:
                await self.db.delete(c)
            proposal.distance_threshold = distance_threshold
            proposal.total_uncategorized = clusters_data["total_uncategorized"]
            proposal.unclustered_count = clusters_data["unclustered_count"]
        else:
            proposal = ClassificationProposal(
                user_id=user.id,
                account_id=account_id,
                distance_threshold=distance_threshold,
                total_uncategorized=clusters_data["total_uncategorized"],
                unclustered_count=clusters_data["unclustered_count"],
            )
            self.db.add(proposal)
        await self.db.flush()

        cluster_index = 0

        # Add linked ProposalClusters first (rule-matched, linked to existing TC)
        for cluster_data in linked_clusters:
            c = ClassificationProposalCluster(
                proposal_id=proposal.id,
                cluster_index=cluster_index,
                representative_label=cluster_data["representative_label"],
                transaction_ids=cluster_data["transaction_ids"],
                transactions=cluster_data["transactions"],
                transaction_count=cluster_data["transaction_count"],
                total_amount_abs=cluster_data["total_amount_abs"],
                suggested_category_id=cluster_data.get("suggested_category_id"),
                suggested_category_name=cluster_data.get("suggested_category_name"),
                suggestion_confidence=cluster_data.get("suggestion_confidence"),
                suggestion_source=cluster_data.get("suggestion_source"),
                suggestion_explanation=cluster_data.get("suggestion_explanation"),
                status="pending",
                rule_pattern=cluster_data.get("rule_pattern"),
                transaction_cluster_id=cluster_data.get("transaction_cluster_id"),
            )
            self.db.add(c)
            cluster_index += 1

        # Add unlinked ProposalClusters (embedding-based, new patterns)
        for cluster_data in clusters_data["clusters"]:
            c = ClassificationProposalCluster(
                proposal_id=proposal.id,
                cluster_index=cluster_index,
                representative_label=cluster_data["representative_label"],
                transaction_ids=cluster_data["transaction_ids"],
                transactions=cluster_data["transactions"],
                transaction_count=cluster_data["transaction_count"],
                total_amount_abs=cluster_data["total_amount_abs"],
                suggested_category_id=cluster_data.get("suggested_category_id"),
                suggested_category_name=cluster_data.get("suggested_category_name"),
                suggestion_confidence=cluster_data.get("suggestion_confidence"),
                suggestion_source=cluster_data.get("suggestion_source"),
                suggestion_explanation=cluster_data.get("suggestion_explanation"),
                status="pending",
            )
            self.db.add(c)
            cluster_index += 1

        await self.db.flush()
        await self.db.refresh(proposal)
        result = await self.db.execute(
            select(ClassificationProposal)
            .where(ClassificationProposal.id == proposal.id)
            .options(selectinload(ClassificationProposal.clusters))
        )
        proposal = result.scalar_one()

        logger.info(
            "classification_recalculated",
            user_id=user.id,
            account_id=account_id,
            linked_clusters=len(linked_clusters),
            embedding_clusters=len(clusters_data["clusters"]),
        )

        return self._proposal_to_dict(proposal)

    async def patch_proposal(
        self,
        user: User,
        account_id: int,
        cluster_updates: list[dict],
    ) -> dict | None:
        """Update cluster states (status, override, excluded_ids, etc.)."""
        proposal = await self.db.execute(
            select(ClassificationProposal)
            .where(
                ClassificationProposal.user_id == user.id,
                ClassificationProposal.account_id == account_id,
            )
            .options(selectinload(ClassificationProposal.clusters))
        )
        proposal = proposal.scalar_one_or_none()
        if not proposal:
            return None

        cluster_by_id = {c.id: c for c in proposal.clusters}
        for upd in cluster_updates:
            cid = upd.get("cluster_id")
            if cid not in cluster_by_id:
                continue
            c = cluster_by_id[cid]
            if "status" in upd and upd["status"]:
                c.status = upd["status"]
            if "override_category_id" in upd:
                c.override_category_id = upd["override_category_id"]
            if "rule_pattern" in upd:
                c.rule_pattern = upd["rule_pattern"] or None
            if "custom_label" in upd:
                c.custom_label = upd["custom_label"] or None
            if "excluded_ids" in upd:
                c.excluded_ids = upd["excluded_ids"] or None

        await self.db.flush()
        await self.db.refresh(proposal)
        result = await self.db.execute(
            select(ClassificationProposal)
            .where(ClassificationProposal.id == proposal.id)
            .options(selectinload(ClassificationProposal.clusters))
        )
        proposal = result.scalar_one()

        return self._proposal_to_dict(proposal)

    async def apply_cluster(
        self,
        user: User,
        cluster_id: int,
        transaction_ids: list[int],
        category_id: int,
        create_rule: bool = True,
        rule_pattern: str | None = None,
        custom_label: str | None = None,
        detach: bool = False,
    ) -> dict:
        """Apply classification to a cluster's transactions. Updates cluster status to accepted.

        EVOL-001: Handles linked vs unlinked proposals:
        - Linked (transaction_cluster_id set, detach=False): merge txns into existing TC
        - Linked + detach=True: ignore the link, create a new TC instead
        - Unlinked (transaction_cluster_id is None): create a new TC (as before)
        """
        from fastapi import HTTPException

        from app.services.embedding_service import EmbeddingService

        # Verify cluster exists and belongs to user
        cluster_result = await self.db.execute(
            select(ClassificationProposalCluster)
            .join(ClassificationProposal, ClassificationProposalCluster.proposal_id == ClassificationProposal.id)
            .where(
                ClassificationProposalCluster.id == cluster_id,
                ClassificationProposal.user_id == user.id,
            )
        )
        cluster = cluster_result.scalar_one_or_none()
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster introuvable ou accès refusé")

        embedding_service = EmbeddingService(self.db)
        result = await embedding_service.classify_transactions(
            transaction_ids=transaction_ids,
            category_id=category_id,
            user=user,
            custom_label=custom_label,
            create_rule=create_rule,
            rule_pattern=rule_pattern,
        )

        # Update cluster status
        cluster.status = "accepted"
        cluster.override_category_id = category_id
        if rule_pattern:
            cluster.rule_pattern = rule_pattern
        if custom_label:
            cluster.custom_label = custom_label
        await self.db.flush()

        from app.services.cluster_service import ClusterService
        cluster_service = ClusterService(self.db)

        # EVOL-001: Linked proposal → merge into existing TC (unless detach requested)
        if cluster.transaction_cluster_id and not detach:
            # Merge transactions into the existing TransactionCluster
            from app.models.transaction_cluster import TransactionCluster
            tc = await self.db.get(TransactionCluster, cluster.transaction_cluster_id)
            if tc and tc.user_id == user.id:
                current_ids = set(tc.transaction_ids or [])
                new_ids = list(current_ids | set(transaction_ids))
                await cluster_service.update_cluster(
                    user=user,
                    cluster_id=tc.id,
                    transaction_ids=new_ids,
                )
                logger.info(
                    "cluster_merged",
                    user_id=user.id,
                    tc_id=tc.id,
                    merged_count=len(transaction_ids),
                )
            else:
                # TC not found or ownership mismatch — fall through to create new
                logger.warning(
                    "linked_tc_not_found",
                    user_id=user.id,
                    tc_id=cluster.transaction_cluster_id,
                )
                cluster_name = custom_label or cluster.representative_label
                await cluster_service.create_cluster(
                    user=user,
                    name=cluster_name,
                    transaction_ids=transaction_ids,
                    category_id=category_id,
                    source="classification",
                    proposal_cluster_id=cluster.id,
                    rule_pattern=rule_pattern,
                    match_type="embedding",
                )
        else:
            # Unlinked proposal or detach: create a new persistent TransactionCluster
            cluster_name = custom_label or cluster.representative_label
            await cluster_service.create_cluster(
                user=user,
                name=cluster_name,
                transaction_ids=transaction_ids,
                category_id=category_id,
                source="classification",
                proposal_cluster_id=cluster.id,
                rule_pattern=rule_pattern,
                match_type="embedding",
            )

        return result

    async def recluster(
        self,
        user: User,
        cluster_id: int,
        distance_threshold: float | None = None,
        use_llm: bool = True,
    ) -> tuple[dict, dict]:
        """Recluster a single cluster. Prefers LLM when available, else embeddings.

        Returns (proposal_dict, debug_info).
        debug_info: {method, llm_raw_response?, llm_parse_error?}
        """
        from fastapi import HTTPException

        from app.models.transaction import Transaction
        from app.services.embedding_service import EmbeddingService
        from app.services.llm_service import LLMService

        cluster_result = await self.db.execute(
            select(ClassificationProposalCluster)
            .join(ClassificationProposal, ClassificationProposalCluster.proposal_id == ClassificationProposal.id)
            .where(
                ClassificationProposalCluster.id == cluster_id,
                ClassificationProposal.user_id == user.id,
            )
            .options(selectinload(ClassificationProposalCluster.proposal).selectinload(ClassificationProposal.clusters))
        )
        cluster = cluster_result.scalar_one_or_none()
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster introuvable ou accès refusé")

        proposal = cluster.proposal
        if not proposal:
            raise HTTPException(status_code=404, detail="Proposition introuvable")

        txn_ids = cluster.transaction_ids or []
        if len(txn_ids) < 2:
            raise HTTPException(
                status_code=400,
                detail="Un cluster d'une seule transaction ne peut pas être fragmenté.",
            )

        sub_clusters = None
        debug_info: dict = {"method": "embedding", "llm_raw_response": None, "llm_parse_error": None}

        # Try LLM first when requested (better semantic split)
        if use_llm:
            llm_service = LLMService()
            if await llm_service.is_available():
                # Fetch transactions from DB to ensure correct IDs and format (cluster.transactions
                # from JSONB can have type inconsistencies, e.g. id as float)
                user_accounts = select(Account.id).where(Account.user_id == user.id)
                txn_result = await self.db.execute(
                    select(Transaction).where(
                        Transaction.id.in_(txn_ids),
                        Transaction.account_id.in_(user_accounts),
                    )
                )
                txns_from_db = list(txn_result.scalars().all())
                transactions_data = [
                    {
                        "id": t.id,
                        "label_raw": t.label_raw,
                        "amount": float(t.amount),
                        "date": t.date.isoformat(),
                    }
                    for t in txns_from_db
                ]
                if transactions_data:
                    embedding_service = EmbeddingService(self.db)
                    enriched_cats = await embedding_service._get_enriched_categories(user)
                    raw_response, sub_clusters = await llm_service.suggest_subclusters(
                        transactions=transactions_data,
                        representative_label=cluster.representative_label,
                        categories=enriched_cats,
                    )
                    debug_info["llm_raw_response"] = raw_response
                    if raw_response and not sub_clusters:
                        debug_info["llm_parse_error"] = "Parse échoué (JSON invalide ou format incorrect)"
                    if sub_clusters:
                        # Enrich with transaction details (reuse txns_from_db)
                        txn_map = {t.id: t for t in txns_from_db}
                        enriched = []
                        for sc in sub_clusters:
                            ids = sc["transaction_ids"]
                            txns = [txn_map[i] for i in ids if i in txn_map]
                            if not txns:
                                continue
                            all_txns = [
                                {
                                    "id": t.id,
                                    "label_raw": t.label_raw,
                                    "amount": float(t.amount),
                                    "date": t.date.isoformat(),
                                }
                                for t in txns
                            ]
                            total_abs = sum(abs(float(t.amount)) for t in txns)
                            enriched.append({
                                "transaction_ids": ids,
                                "transactions": all_txns,
                                "transaction_count": len(ids),
                                "total_amount_abs": total_abs,
                                "representative_label": sc["representative_label"],
                                "suggested_category_id": sc.get("suggested_category_id"),
                                "suggested_category_name": sc.get("suggested_category_name"),
                                "suggestion_confidence": "medium",
                                "suggestion_source": "llm_fragment",
                                "suggestion_explanation": None,
                            })
                        if len(enriched) >= 2:
                            sub_clusters = enriched
                            debug_info["method"] = "llm"
                        else:
                            sub_clusters = None
                            debug_info["llm_parse_error"] = (
                                debug_info.get("llm_parse_error")
                                or "LLM a retourné un seul sous-groupe (cluster jugé homogène)"
                            )

        # Fallback to embedding-based clustering
        if not sub_clusters:
            threshold = distance_threshold or (float(proposal.distance_threshold) * 0.5)
            threshold = max(0.08, min(threshold, 0.5))
            embedding_service = EmbeddingService(self.db)
            sub_clusters = await embedding_service.cluster_transaction_subset(
                user=user,
                transaction_ids=txn_ids,
                distance_threshold=threshold,
                min_cluster_size=1,
            )

        if not sub_clusters:
            return (self._proposal_to_dict(proposal), debug_info)

        # Delete old cluster, add new ones
        max_index = max((c.cluster_index for c in proposal.clusters if c.id != cluster.id), default=-1)
        await self.db.delete(cluster)
        await self.db.flush()
        for i, cluster_data in enumerate(sub_clusters):
            c = ClassificationProposalCluster(
                proposal_id=proposal.id,
                cluster_index=max_index + 1 + i,
                representative_label=cluster_data["representative_label"],
                transaction_ids=cluster_data["transaction_ids"],
                transactions=cluster_data["transactions"],
                transaction_count=cluster_data["transaction_count"],
                total_amount_abs=cluster_data["total_amount_abs"],
                suggested_category_id=cluster_data.get("suggested_category_id"),
                suggested_category_name=cluster_data.get("suggested_category_name"),
                suggestion_confidence=cluster_data.get("suggestion_confidence"),
                suggestion_source=cluster_data.get("suggestion_source"),
                suggestion_explanation=cluster_data.get("suggestion_explanation"),
                status="pending",
            )
            self.db.add(c)
        await self.db.flush()
        await self.db.refresh(proposal)

        result = await self.db.execute(
            select(ClassificationProposal)
            .where(ClassificationProposal.id == proposal.id)
            .options(selectinload(ClassificationProposal.clusters))
        )
        proposal = result.scalar_one()

        logger.info(
            "cluster_reclustered",
            user_id=user.id,
            cluster_id=cluster_id,
            sub_clusters=len(sub_clusters),
            method=debug_info["method"],
        )

        return (self._proposal_to_dict(proposal), debug_info)
