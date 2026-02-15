"""Classification proposal API schemas."""

from pydantic import BaseModel


class ClassificationClusterResponse(BaseModel):
    """A cluster in a classification proposal (compatible with TransactionCluster + user state)."""
    cluster_id: int
    transaction_count: int
    total_amount_abs: float
    transaction_ids: list[int]
    sample_transactions: list[dict]
    transactions: list[dict]
    representative_label: str
    suggested_category_id: int | None = None
    suggested_category_name: str | None = None
    suggestion_confidence: str | None = None
    suggestion_similarity: float | None = None
    suggestion_source: str | None = None
    suggestion_explanation: str | None = None
    status: str = "pending"
    override_category_id: int | None = None
    rule_pattern: str | None = None
    custom_label: str | None = None
    excluded_ids: list[int] | None = None


class ClassificationProposalResponse(BaseModel):
    """Full classification proposal for an account."""
    account_id: int
    distance_threshold: float
    total_uncategorized: int
    unclustered_count: int
    clusters: list[ClassificationClusterResponse]


class RecalculateRequest(BaseModel):
    """Request to recalculate classification proposal."""
    account_id: int
    distance_threshold: float = 0.22


class ClusterUpdate(BaseModel):
    """Update for a single cluster (apply, skip, overrides)."""
    cluster_id: int
    status: str | None = None  # pending, accepted, skipped
    override_category_id: int | None = None
    rule_pattern: str | None = None
    custom_label: str | None = None
    excluded_ids: list[int] | None = None


class ClassificationPatchRequest(BaseModel):
    """Request to patch classification proposal (cluster updates)."""
    account_id: int
    cluster_updates: list[ClusterUpdate] | None = None


class ApplyClusterRequest(BaseModel):
    """Request to apply a cluster (classify its transactions)."""
    transaction_ids: list[int]
    category_id: int
    create_rule: bool = True
    rule_pattern: str | None = None
    custom_label: str | None = None


class ApplyClusterResponse(BaseModel):
    """Response after applying a cluster."""
    classified_count: int
    rule_created: bool


class ReclusterRequest(BaseModel):
    """Request to recluster a single cluster (split heterogeneous cluster)."""
    distance_threshold: float | None = None  # For embedding fallback; default: 50% of proposal's
    use_llm: bool = True  # Prefer LLM for semantic split when available


class ReclusterDebug(BaseModel):
    """Debug info for recluster (LLM response, method used)."""
    method: str  # "llm" | "embedding"
    llm_raw_response: str | None = None
    llm_parse_error: str | None = None


class ReclusterResponse(BaseModel):
    """Response from recluster: proposal + debug info."""
    proposal: ClassificationProposalResponse
    debug: ReclusterDebug
