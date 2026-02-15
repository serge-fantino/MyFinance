"""Local LLM classification service using Ollama.

Uses a local open-weight model (Mistral, Llama, etc.) via Ollama to classify
transaction clusters into categories. This replaces the naive embedding-based
category semantic matching with a much more robust approach: the LLM has
world knowledge about what merchants/businesses correspond to which spending
categories.

Ollama runs as a Docker service and exposes a simple HTTP API.
"""

import json
import re

import httpx
import structlog

from app.config import settings

logger = structlog.get_logger()


class LLMService:
    """Classify transaction clusters using a local LLM via Ollama."""

    def __init__(self) -> None:
        self.base_url = settings.llm_base_url.rstrip("/")
        self.model = settings.llm_model

    async def is_available(self) -> bool:
        """Check if Ollama is reachable and has the configured model."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code != 200:
                    return False
                data = resp.json()
                model_names = [m.get("name", "") for m in data.get("models", [])]
                # Check if any model name starts with our configured model
                return any(
                    n == self.model or n.startswith(f"{self.model}:")
                    for n in model_names
                )
        except (httpx.ConnectError, httpx.TimeoutException):
            return False

    async def suggest_category(
        self,
        representative_label: str,
        sample_transactions: list[dict],
        categories: list[dict],
    ) -> dict | None:
        """Ask the LLM to classify a cluster of transactions.

        Args:
            representative_label: The main label representing the cluster
            sample_transactions: List of {label_raw, amount, date} samples
            categories: List of {id, name, parent_name, description} available categories

        Returns:
            {category_id, category_name, confidence, explanation, source} or None
        """
        raw, suggestion = await self.suggest_category_with_raw(
            representative_label, sample_transactions, categories
        )
        return suggestion

    async def suggest_category_with_raw(
        self,
        representative_label: str,
        sample_transactions: list[dict],
        categories: list[dict],
    ) -> tuple[str | None, dict | None]:
        """Ask the LLM to classify a cluster; return raw response and parsed suggestion.

        Returns:
            (raw_response_text, suggestion_dict or None)
        """
        prompt = self._build_prompt(
            representative_label, sample_transactions, categories
        )

        try:
            response_text = await self._call_ollama(prompt)
            if not response_text:
                return (None, None)
            suggestion = self._parse_response(response_text, categories)
            return (response_text.strip(), suggestion)
        except Exception as e:
            logger.warning("llm_classification_failed", error=str(e))
            return (None, None)

    async def suggest_category_with_subselection(
        self,
        representative_label: str,
        transactions: list[dict],
        categories: list[dict],
    ) -> tuple[str | None, dict | None]:
        """Ask the LLM to classify a cluster AND suggest which transactions to include.

        Returns:
            (raw_response_text, suggestion_dict with optional suggested_include_ids)
        """
        prompt = self._build_prompt_with_subselection(
            representative_label, transactions, categories
        )

        try:
            response_text = await self._call_ollama(prompt, num_predict=400)
            if not response_text:
                return (None, None)
            suggestion = self._parse_response_with_subselection(
                response_text, categories, transactions
            )
            return (response_text.strip(), suggestion)
        except Exception as e:
            logger.warning("llm_classification_failed", error=str(e))
            return (None, None)

    async def suggest_categories_batch(
        self,
        clusters: list[dict],
        categories: list[dict],
    ) -> dict[int, dict | None]:
        """Classify multiple clusters. Returns {cluster_id: suggestion}."""
        results = {}
        for cluster in clusters:
            suggestion = await self.suggest_category(
                representative_label=cluster["representative_label"],
                sample_transactions=cluster.get("sample_transactions", []),
                categories=categories,
            )
            results[cluster["cluster_id"]] = suggestion
        return results

    async def suggest_subclusters(
        self,
        transactions: list[dict],
        representative_label: str,
        categories: list[dict] | None = None,
    ) -> tuple[str | None, list[dict] | None]:
        """Ask the LLM to split a heterogeneous cluster into sub-groups.

        Returns (raw_response_text, parsed_subclusters or None).
        parsed_subclusters: list of {transaction_ids, representative_label, category_id?, category_name?}
        """
        prompt = self._build_subclusters_prompt(
            transactions, representative_label, categories or []
        )
        try:
            response_text = await self._call_ollama(prompt, num_predict=600)
            if not response_text:
                return (None, None)
            parsed = self._parse_subclusters_response(
                response_text.strip(), transactions, categories or []
            )
            return (response_text.strip(), parsed)
        except Exception as e:
            logger.warning("llm_subclusters_failed", error=str(e))
            return (None, None)

    def _build_subclusters_prompt(
        self,
        transactions: list[dict],
        representative_label: str,
        categories: list[dict],
    ) -> str:
        """Build prompt for sub-cluster suggestion."""
        txn_lines = []
        for t in transactions:
            amount = t.get("amount", 0)
            sign = "+" if amount >= 0 else ""
            txn_lines.append(
                f"  id={t.get('id')}: {t.get('label_raw', '')} ({sign}{amount}€, {t.get('date', '')})"
            )
        txn_block = "\n".join(txn_lines) if txn_lines else "  (aucune)"

        cat_block = ""
        category_instruction = ""
        json_format = '{{"subclusters": [{{"ids": [<id1>, <id2>, ...], "representative_label": "<libellé court>"}}, ...]}}'
        if categories:
            cat_lines = []
            for cat in categories:
                parent = cat.get("parent_name", "")
                prefix = f"{parent} > " if parent else ""
                desc = cat.get("description", "")
                line = f"  {cat['id']}: {prefix}{cat['name']}"
                if desc:
                    line += f" — {desc}"
                cat_lines.append(line)
            cat_block = "\n\nCatégories disponibles :\n" + "\n".join(cat_lines)
            category_instruction = "\nPour chaque sous-groupe, suggère la catégorie la plus appropriée parmi la liste ci-dessus."
            json_format = '{{"subclusters": [{{"ids": [<id1>, <id2>, ...], "representative_label": "<libellé court>", "category_id": <id>, "category_name": "<nom>"}}, ...]}}'

        return f"""Tu es un assistant de classification de transactions bancaires.

Ce groupe de transactions a été regroupé automatiquement sous le libellé "{representative_label}".
Mais il semble hétérogène : certaines transactions n'ont peut-être pas le même type de dépense.

Voici les transactions du groupe (avec leur id) :
{txn_block}
{cat_block}

Analyse sémantiquement ces transactions et découpe-les en sous-groupes homogènes.
Chaque sous-groupe doit contenir des transactions qui correspondent au même type de dépense (même marchand, même catégorie logique).{category_instruction}

Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après :
{json_format}

Règles :
- "ids" : liste des ids des transactions du sous-groupe
- "representative_label" : libellé court représentatif (ex: "AMAZON", "LOYER")
- "category_id" et "category_name" : obligatoires si des catégories sont fournies
- Chaque transaction doit apparaître dans exactement un sous-groupe
- Si le groupe est vraiment homogène, retourne un seul sous-groupe avec toutes les transactions
- Minimum 2 sous-groupes si tu détectes une hétérogénéité claire"""

    def _parse_subclusters_response(
        self,
        response_text: str,
        transactions: list[dict],
        categories: list[dict],
    ) -> list[dict] | None:
        """Parse LLM response into sub-cluster list."""
        valid_ids = set()
        for t in transactions:
            tid = t.get("id")
            if tid is not None:
                try:
                    valid_ids.add(int(tid))
                except (ValueError, TypeError):
                    pass
        valid_cat_ids = {c["id"] for c in categories}
        cat_by_id = {c["id"]: c for c in categories}
        cat_by_name = {c["name"].lower(): c for c in categories}
        text = response_text.strip()

        parsed = self._try_parse_json(text)
        if not parsed:
            json_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
            if json_match:
                parsed = self._try_parse_json(json_match.group())
        if not parsed:
            return None

        subclusters_raw = parsed.get("subclusters")
        if not isinstance(subclusters_raw, list) or len(subclusters_raw) < 1:
            return None

        result = []
        used_ids = set()
        for sc in subclusters_raw:
            ids_raw = sc.get("ids") if isinstance(sc, dict) else None
            if not isinstance(ids_raw, list):
                continue
            ids = []
            for x in ids_raw:
                try:
                    xi = int(x)
                    if xi in valid_ids:
                        ids.append(xi)
                except (ValueError, TypeError):
                    pass
            if not ids:
                continue
            label = sc.get("representative_label", "") if isinstance(sc, dict) else ""
            if not isinstance(label, str):
                label = str(label)

            cat_id = None
            cat_name = None
            if isinstance(sc, dict) and categories:
                raw_cat_id = sc.get("category_id")
                raw_cat_name = sc.get("category_name", "")
                if raw_cat_id is not None:
                    try:
                        cid = int(raw_cat_id)
                        if cid in valid_cat_ids:
                            cat_id = cid
                            cat_name = cat_by_id[cid].get("name", "")
                    except (ValueError, TypeError):
                        pass
                if cat_id is None and isinstance(raw_cat_name, str) and raw_cat_name:
                    matched = cat_by_name.get(raw_cat_name.strip().lower())
                    if matched:
                        cat_id = matched["id"]
                        cat_name = matched["name"]

            result.append({
                "transaction_ids": ids,
                "representative_label": label.strip() or "Sous-groupe",
                "suggested_category_id": cat_id,
                "suggested_category_name": cat_name,
            })
            used_ids.update(ids)

        if not result:
            return None
        # Assign any orphan ids to first cluster
        orphan = valid_ids - used_ids
        if orphan and result:
            result[0]["transaction_ids"] = list(result[0]["transaction_ids"]) + list(orphan)

        return result

    def _build_prompt(
        self,
        representative_label: str,
        sample_transactions: list[dict],
        categories: list[dict],
    ) -> str:
        """Build the classification prompt for the LLM."""
        # Format categories with descriptions
        cat_lines = []
        for cat in categories:
            desc = cat.get("description", "")
            parent = cat.get("parent_name", "")
            prefix = f"{parent} > " if parent else ""
            line = f"  {cat['id']}: {prefix}{cat['name']}"
            if desc:
                line += f" — {desc}"
            cat_lines.append(line)
        cat_block = "\n".join(cat_lines)

        # Format sample transactions
        sample_lines = []
        for txn in sample_transactions[:5]:
            amount = txn.get("amount", 0)
            sign = "+" if amount >= 0 else ""
            date_str = txn.get("date", "")
            label = txn.get("label_raw", "")
            sample_lines.append(f"  - {label} ({sign}{amount}€, {date_str})")
        samples_block = "\n".join(sample_lines) if sample_lines else "  (pas d'exemples)"

        return f"""Tu es un assistant de classification de transactions bancaires personnelles.

Voici les catégories disponibles :
{cat_block}

Voici un groupe de transactions similaires. Le libellé représentatif est : "{representative_label}"

Exemples de transactions du groupe :
{samples_block}

Dans quelle catégorie ce groupe de transactions devrait-il être classé ?

Réponds UNIQUEMENT avec un JSON valide au format suivant, sans aucun texte avant ou après :
{{"category_id": <id>, "category_name": "<nom>", "confidence": "<high|medium|low>", "explanation": "<explication courte>"}}

Règles :
- Choisis exactement UNE catégorie parmi la liste ci-dessus
- "confidence" : "high" si tu es sûr, "medium" si probable, "low" si incertain
- "explanation" : une phrase courte expliquant ton choix
- Si tu ne peux vraiment pas classifier, réponds : {{"category_id": null, "category_name": null, "confidence": "low", "explanation": "impossible à déterminer"}}"""

    def _build_prompt_with_subselection(
        self,
        representative_label: str,
        transactions: list[dict],
        categories: list[dict],
    ) -> str:
        """Build prompt that asks for category + which transaction IDs to include."""
        cat_lines = []
        for cat in categories:
            desc = cat.get("description", "")
            parent = cat.get("parent_name", "")
            prefix = f"{parent} > " if parent else ""
            line = f"  {cat['id']}: {prefix}{cat['name']}"
            if desc:
                line += f" — {desc}"
            cat_lines.append(line)
        cat_block = "\n".join(cat_lines)

        txn_lines = []
        for t in transactions:
            amount = t.get("amount", 0)
            sign = "+" if amount >= 0 else ""
            txn_lines.append(
                f"  id={t.get('id')}: {t.get('label_raw', '')} ({sign}{amount}€, {t.get('date', '')})"
            )
        txn_block = "\n".join(txn_lines) if txn_lines else "  (aucune)"

        return f"""Tu es un assistant de classification de transactions bancaires personnelles.

Voici les catégories disponibles :
{cat_block}

Voici un groupe de transactions similaires. Libellé représentatif : "{representative_label}"

Transactions du groupe (avec leur id) :
{txn_block}

1) Dans quelle catégorie ce groupe devrait-il être classé ?
2) Certaines transactions peuvent être des intrus (erreur de regroupement). Liste UNIQUEMENT les ids des transactions qui appartiennent vraiment à la catégorie choisie.

Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après :
{{"category_id": <id>, "category_name": "<nom>", "confidence": "<high|medium|low>", "explanation": "<explication>", "include_ids": [<id1>, <id2>, ...]}}

Règles :
- "category_id" : une catégorie de la liste
- "include_ids" : liste des ids des transactions à inclure (toutes si le groupe est homogène, sinon seulement celles qui correspondent)
- Si toutes les transactions conviennent, mets tous les ids dans include_ids
- Si tu ne peux pas classifier : {{"category_id": null, "category_name": null, "confidence": "low", "explanation": "...", "include_ids": []}}"""

    def _parse_response_with_subselection(
        self,
        response_text: str,
        categories: list[dict],
        transactions: list[dict],
    ) -> dict | None:
        """Parse LLM response including include_ids."""
        base = self._parse_response(response_text, categories)
        if not base:
            return None

        text = response_text.strip()
        parsed = self._try_parse_json(text)
        if not parsed:
            json_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
            if json_match:
                parsed = self._try_parse_json(json_match.group())
        if not parsed:
            return base

        valid_ids = {t.get("id") for t in transactions if t.get("id") is not None}
        include_ids = parsed.get("include_ids")
        if isinstance(include_ids, list):
            include_ids = [int(x) for x in include_ids if x in valid_ids]
        else:
            include_ids = None

        base["suggested_include_ids"] = include_ids
        return base

    async def _call_ollama(self, prompt: str, num_predict: int = 200) -> str | None:
        """Call Ollama generate API."""
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=5.0,
                    read=settings.llm_timeout,
                    write=5.0,
                    pool=5.0,
                )
            ) as client:
                resp = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.1,
                            "num_predict": num_predict,
                        },
                    },
                )
                if resp.status_code != 200:
                    logger.warning(
                        "ollama_error",
                        status=resp.status_code,
                        body=resp.text[:200],
                    )
                    return None
                data = resp.json()
                return data.get("response", "")
        except httpx.TimeoutException:
            logger.warning("ollama_timeout", model=self.model)
            return None
        except httpx.ConnectError:
            logger.warning("ollama_unreachable", url=self.base_url)
            return None

    def _parse_response(
        self, response_text: str, categories: list[dict]
    ) -> dict | None:
        """Parse the LLM JSON response into a suggestion dict."""
        # Try to extract JSON from the response
        text = response_text.strip()

        # Try direct JSON parse first
        parsed = self._try_parse_json(text)
        if not parsed:
            # Try to find JSON in the response (LLM sometimes adds text around it)
            json_match = re.search(r"\{[^{}]+\}", text)
            if json_match:
                parsed = self._try_parse_json(json_match.group())

        if not parsed:
            logger.warning("llm_parse_failed", response=text[:200])
            return None

        cat_id = parsed.get("category_id")
        if cat_id is None:
            return None

        # Validate category_id exists
        valid_ids = {c["id"] for c in categories}
        if cat_id not in valid_ids:
            # Try to find by name
            cat_name = parsed.get("category_name", "")
            matched = next(
                (c for c in categories if c["name"].lower() == cat_name.lower()),
                None,
            )
            if matched:
                cat_id = matched["id"]
            else:
                logger.warning(
                    "llm_invalid_category",
                    category_id=cat_id,
                    valid_ids=list(valid_ids),
                )
                return None

        # Find category name
        cat = next((c for c in categories if c["id"] == cat_id), None)
        cat_name = cat["name"] if cat else parsed.get("category_name", "")

        confidence = parsed.get("confidence", "medium")
        if confidence not in ("high", "medium", "low"):
            confidence = "medium"

        return {
            "category_id": cat_id,
            "category_name": cat_name,
            "confidence": confidence,
            "similarity": None,
            "source": "llm",
            "explanation": parsed.get("explanation", ""),
        }

    @staticmethod
    def _try_parse_json(text: str) -> dict | None:
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return None
