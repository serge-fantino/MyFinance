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
        prompt = self._build_prompt(
            representative_label, sample_transactions, categories
        )

        try:
            response_text = await self._call_ollama(prompt)
            if not response_text:
                return None
            return self._parse_response(response_text, categories)
        except Exception as e:
            logger.warning("llm_classification_failed", error=str(e))
            return None

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

    async def _call_ollama(self, prompt: str) -> str | None:
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
                            "num_predict": 200,
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
