"""Transaction cluster schemas."""

from pydantic import BaseModel


class ClusterCreate(BaseModel):
    name: str
    transaction_ids: list[int]
    account_id: int | None = None
    category_id: int | None = None
    description: str | None = None
    source: str = "manual"
    rule_pattern: str | None = None
    match_type: str | None = None


class ClusterUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category_id: int | None = None
    transaction_ids: list[int] | None = None


class ClusterFromProposal(BaseModel):
    proposal_cluster_id: int
    name: str | None = None
    category_id: int | None = None


class ClusterResponse(BaseModel):
    id: int
    user_id: int
    account_id: int | None
    name: str
    description: str | None
    category_id: int | None
    source: str
    rule_id: int | None
    rule_pattern: str | None
    match_type: str | None
    transaction_ids: list[int]
    transaction_count: int
    total_amount: float | None
    total_amount_abs: float | None
    avg_amount: float | None
    min_amount: float | None
    max_amount: float | None
    stddev_amount: float | None
    avg_days_between: float | None
    is_recurring: bool | None
    recurrence_pattern: str | None
    first_date: str | None
    last_date: str | None
    statistics: dict | None

    model_config = {"from_attributes": True}


class ClusterTransactionResponse(BaseModel):
    id: int
    date: str
    label_raw: str
    label_clean: str | None
    amount: float
    category_id: int | None
