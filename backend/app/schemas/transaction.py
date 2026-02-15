"""Transaction schemas for request/response validation."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class TransactionCreate(BaseModel):
    account_id: int
    date: date
    value_date: date | None = None
    label_raw: str
    amount: Decimal
    currency: str = "EUR"
    category_id: int | None = None
    notes: str | None = None
    tags: list[str] | None = None


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    subcategory: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    label_clean: str | None = None
    custom_label: str | None = None  # Used when creating a rule (label_clean for matched txns)
    create_rule: bool = True  # If False, only update this transaction; no rule created
    rule_pattern: str | None = None  # When create_rule=True: pattern for the rule (default: label_raw)


class TransactionResponse(BaseModel):
    id: int
    account_id: int
    date: date
    value_date: date | None = None
    label_raw: str
    label_clean: str | None = None
    amount: Decimal
    currency: str
    category_id: int | None = None
    category_name: str | None = None
    subcategory: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    source: str
    ai_confidence: str | None = None
    parsed_metadata: dict | None = None
    created_at: datetime
    rule_applied_count: int | None = None  # Only set after a category update

    model_config = {"from_attributes": True}


class TransactionFilter(BaseModel):
    account_id: int | None = None
    date_from: date | None = None
    date_to: date | None = None
    category_id: int | None = None
    amount_min: Decimal | None = None
    amount_max: Decimal | None = None
    search: str | None = None


class PaginatedResponse(BaseModel):
    data: list[TransactionResponse]
    meta: dict  # {total, page, per_page, pages}


class ImportResult(BaseModel):
    total_rows: int
    imported_count: int
    duplicate_count: int
    error_count: int
    errors: list[str] | None = None
    rules_applied: int | None = None
    embeddings_computed: int | None = None


# ── Embedding classification schemas ────────────────────


class ComputeEmbeddingsResult(BaseModel):
    """Result of computing embeddings for transactions."""
    computed: int
    skipped: int
    total: int


class ClusterSampleTransaction(BaseModel):
    """A sample transaction within a cluster."""
    id: int
    label_raw: str
    amount: float
    date: str


class TransactionCluster(BaseModel):
    """A cluster of similar uncategorized transactions with a category suggestion."""
    cluster_id: int
    transaction_count: int
    total_amount_abs: float
    transaction_ids: list[int]
    sample_transactions: list[ClusterSampleTransaction]
    transactions: list[ClusterSampleTransaction]
    representative_label: str
    suggested_category_id: int | None = None
    suggested_category_name: str | None = None
    suggestion_confidence: str | None = None  # high, medium, low
    suggestion_similarity: float | None = None
    suggestion_source: str | None = None  # similar_transactions, llm
    suggestion_explanation: str | None = None  # LLM explanation (when source=llm)


class ClustersResponse(BaseModel):
    """Response for the clustering endpoint."""
    clusters: list[TransactionCluster]
    unclustered_count: int
    total_uncategorized: int


class ClusterClassifyRequest(BaseModel):
    """Request to classify a cluster (or arbitrary set) of transactions."""
    transaction_ids: list[int]
    category_id: int
    create_rule: bool = True
    rule_pattern: str | None = None
    custom_label: str | None = None


class ClusterClassifyResult(BaseModel):
    """Result of classifying a cluster of transactions."""
    classified_count: int
    rule_created: bool


class InterpretClusterRequest(BaseModel):
    """Request to interpret a cluster with the LLM (for debugging / manual invoke)."""
    representative_label: str
    transactions: list[ClusterSampleTransaction]


class InterpretClusterSuggestion(BaseModel):
    """Parsed LLM suggestion for a cluster."""
    category_id: int
    category_name: str
    confidence: str
    explanation: str
    # IDs of transactions to include (subset if LLM identifies outliers)
    suggested_include_ids: list[int] | None = None


class InterpretClusterResult(BaseModel):
    """Result of LLM interpretation for a cluster."""
    llm_available: bool
    raw_response: str | None = None
    suggestion: InterpretClusterSuggestion | None = None
    error: str | None = None


class LlmStatusResponse(BaseModel):
    """Whether the LLM (Ollama) UI is enabled in the app."""
    ui_enabled: bool


class ParseLabelsResult(BaseModel):
    """Result of parsing labels for existing transactions."""
    parsed: int
    total: int
