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

export interface ImportResult {
  total_rows: number;
  imported_count: number;
  duplicate_count: number;
  error_count: number;
  errors: string[] | null;
  ai_classified?: number;
}

export interface ClassifyResult {
  classified: number;
  failed: number;
  skipped: number;
  total: number;
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
