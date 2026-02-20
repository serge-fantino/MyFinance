export interface ParsedMetadata {
  payment_mode: string | null;
  payment_type: string | null;  // card, transfer, direct_debit, atm, check, fee, etc.
  counterparty: string | null;
  card_id: string | null;
  operation_date: string | null; // ISO date
  check_number: string | null;
  raw_details: string | null;
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  value_date: string | null;
  label_raw: string;
  label_clean: string | null;
  amount: number;
  currency: string;
  category_id: number | null;
  category_name: string | null;
  subcategory: string | null;
  notes: string | null;
  tags: string[] | null;
  source: string;
  ai_confidence: string | null;
  parsed_metadata: ParsedMetadata | null;
  created_at: string;
}

export interface TransactionCreate {
  account_id: number;
  date: string;
  value_date?: string;
  label_raw: string;
  amount: number;
  currency?: string;
  category_id?: number;
  notes?: string;
  tags?: string[];
}

export interface TransactionUpdate {
  category_id?: number;
  subcategory?: string;
  notes?: string;
  tags?: string[];
  label_clean?: string;
  custom_label?: string;
  create_rule?: boolean;
  rule_pattern?: string;
}

export interface TransactionFilter {
  account_id?: number;
  date_from?: string;
  date_to?: string;
  category_id?: number;
  amount_min?: number;
  amount_max?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
}

export interface PaginatedTransactions {
  data: Transaction[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    pages: number;
    total_income: number;
    total_expenses: number;
    total_net: number;
  };
}

export interface FileBalanceInfo {
  date: string;   // ISO date
  amount: number;
  source: string;  // ledger | avail
}

export interface ImportPreviewResult {
  format: string;
  total_rows: number;
  file_account_info: {
    bank_id?: string;
    branch_id?: string;
    acct_id?: string;
    acct_type?: string;
    acct_key?: string;
    institution?: string;
    currency?: string;
  } | null;
  file_balance_info?: FileBalanceInfo | null;
}

export interface ImportResult {
  total_rows: number;
  imported_count: number;
  duplicate_count: number;
  error_count: number;
  errors: string[] | null;
  rules_applied?: number;
  embeddings_computed?: number;
}

export interface CashflowMonthly {
  month: string;       // "2026-01"
  income: number;
  expenses: number;
  net: number;
  count: number;
}

export interface CashflowDaily {
  date: string;        // "2026-01-15"
  net: number;
  income: number;
  expenses: number;
  cumulative: number;
  count: number;
}

// ── Embedding classification types ────────────────────

export interface ComputeEmbeddingsResult {
  computed: number;
  skipped: number;
  total: number;
}

export interface ClusterSampleTransaction {
  id: number;
  label_raw: string;
  amount: number;
  date: string;
}

export interface TransactionCluster {
  cluster_id: number;
  transaction_count: number;
  total_amount_abs: number;
  transaction_ids: number[];
  sample_transactions: ClusterSampleTransaction[];
  transactions: ClusterSampleTransaction[];
  representative_label: string;
  suggested_category_id: number | null;
  suggested_category_name: string | null;
  suggestion_confidence: string | null; // high, medium, low
  suggestion_similarity: number | null;
  suggestion_source: string | null;     // similar_transactions, llm
  suggestion_explanation: string | null; // LLM explanation (when source=llm)
}

export interface ClustersResponse {
  clusters: TransactionCluster[];
  unclustered_count: number;
  total_uncategorized: number;
}

export interface ClusterClassifyRequest {
  transaction_ids: number[];
  category_id: number;
  create_rule?: boolean;
  rule_pattern?: string;
  custom_label?: string;
}

export interface ClusterClassifyResult {
  classified_count: number;
  rule_created: boolean;
}

export interface InterpretClusterRequest {
  representative_label: string;
  transactions: ClusterSampleTransaction[];
}

export interface InterpretClusterSuggestion {
  category_id: number;
  category_name: string;
  confidence: string;
  explanation: string;
  /** IDs of transactions to include (LLM sub-selection) */
  suggested_include_ids?: number[] | null;
}

export interface InterpretClusterResult {
  llm_available: boolean;
  raw_response: string | null;
  suggestion: InterpretClusterSuggestion | null;
  error: string | null;
}

export interface LlmStatusResponse {
  ui_enabled: boolean;
}

export interface ParseLabelsResult {
  parsed: number;
  total: number;
}
