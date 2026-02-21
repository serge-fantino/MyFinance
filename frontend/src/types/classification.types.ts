/** Classification proposal types (server-stored, one per account). */

export interface ClassificationClusterResponse {
  cluster_id: number;
  transaction_count: number;
  total_amount_abs: number;
  transaction_ids: number[];
  sample_transactions: Array<{ id: number; label_raw: string; amount: number; date: string }>;
  transactions: Array<{ id: number; label_raw: string; amount: number; date: string }>;
  representative_label: string;
  suggested_category_id: number | null;
  suggested_category_name: string | null;
  suggestion_confidence: string | null;
  suggestion_similarity: number | null;
  suggestion_source: string | null;
  suggestion_explanation: string | null;
  status: "pending" | "accepted" | "skipped";
  override_category_id: number | null;
  rule_pattern: string | null;
  custom_label: string | null;
  excluded_ids: number[];
}

export interface ClassificationProposalResponse {
  account_id: number;
  distance_threshold: number;
  total_uncategorized: number;
  unclustered_count: number;
  clusters: ClassificationClusterResponse[];
}

export interface ReclusterDebug {
  method: string;
  llm_raw_response: string | null;
  llm_parse_error: string | null;
}

/** Persistent transaction cluster with computed statistics. */
export interface TransactionCluster {
  id: number;
  user_id: number;
  account_id: number | null;
  name: string;
  description: string | null;
  category_id: number | null;
  source: string;
  rule_id: number | null;
  rule_pattern: string | null;
  match_type: string | null;
  transaction_ids: number[];
  transaction_count: number;
  total_amount: number | null;
  total_amount_abs: number | null;
  avg_amount: number | null;
  min_amount: number | null;
  max_amount: number | null;
  stddev_amount: number | null;
  avg_days_between: number | null;
  is_recurring: boolean | null;
  recurrence_pattern: string | null;
  first_date: string | null;
  last_date: string | null;
  statistics: {
    outlier_ids?: number[];
    outlier_count?: number;
    cv?: number;
    trend?: "stable" | "increasing" | "decreasing";
    trend_slope?: number;
  } | null;
}
