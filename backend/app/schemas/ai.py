"""AI chat schemas."""

from datetime import datetime

from pydantic import BaseModel


class ChatMessage(BaseModel):
    content: str
    conversation_id: int | None = None
    account_ids: list[int] | None = None  # scope ceiling from UI
    debug: bool = False  # when True, return debug traces in response


class VizEncoding(BaseModel):
    """A single channel encoding."""
    field: str
    type: str = "nominal"  # nominal, quantitative, temporal
    format: str | None = None  # "currency", etc.

    model_config = {"extra": "allow"}


class VizSpec(BaseModel):
    """Visualization specification (chart type + channel encodings)."""
    chart: str  # bar, pie, area, kpi
    title: str | None = None
    encoding: dict[str, VizEncoding] = {}

    model_config = {"extra": "allow"}


class ChartTrace(BaseModel):
    """Debug trace for a chart (query, viz spec, SQL)."""
    query: dict = {}
    viz: dict = {}
    sql: str | None = None
    row_count: int | None = None
    error: str | None = None
    duration_ms: float | None = None

    model_config = {"extra": "allow"}


class ChartResult(BaseModel):
    """A fully resolved chart: viz spec + query result data."""
    viz: VizSpec
    data: list[dict]
    trace: ChartTrace | None = None  # for debug view in frontend

    model_config = {"extra": "allow"}


class DebugBlockTrace(BaseModel):
    """Debug trace for a single dataviz block execution."""
    query: dict = {}           # the raw query DSL from the LLM
    viz: dict = {}             # the viz spec from the LLM
    sql: str | None = None     # compiled SQL (textual representation)
    row_count: int | None = None
    data_sample: list[dict] = []  # first 5 rows of results
    error: str | None = None   # validation or execution error
    duration_ms: float | None = None


class DebugInfo(BaseModel):
    """Full debug trace for a chat turn."""
    llm_raw_response: str = ""          # raw LLM output (with dataviz blocks)
    dataviz_blocks_found: int = 0       # number of dataviz blocks parsed
    account_scope: list[int] = []       # resolved account IDs
    block_traces: list[DebugBlockTrace] = []
    system_prompt_length: int = 0       # character count of the system prompt
    llm_duration_ms: float | None = None
    error: str | None = None            # top-level error (e.g. LLM failure)


class ChatResponse(BaseModel):
    conversation_id: int
    message: str
    charts: list[ChartResult] = []
    metadata: dict | None = None
    debug: DebugInfo | None = None  # only populated when debug=True
    error: str | None = None        # non-null when a service error occurred


class ConversationResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    metadata: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailResponse(BaseModel):
    id: int
    title: str
    messages: list[MessageResponse]
    created_at: datetime


class ProviderOption(BaseModel):
    """Available provider option for selection."""
    id: str
    label: str
    model: str


class ProviderStatusResponse(BaseModel):
    provider: str
    available: bool
    model_name: str = ""
    providers: list[ProviderOption] = []
    current_provider: str = ""  # effective provider id (may differ from env if overridden)


class AIConfigUpdate(BaseModel):
    """Request to update AI config."""
    provider: str | None = None


class QueryExecuteRequest(BaseModel):
    """Request to execute a raw dataviz query (interactive Query module)."""
    query: dict  # raw query DSL (source, fields, filters, groupBy, aggregates, orderBy, limit)
    viz: dict    # viz spec (chart, title, encoding, columns)
    account_ids: list[int] | None = None  # scope; None = all user accounts
