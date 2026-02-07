export interface CashflowItem {
  period: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CashflowResponse {
  data: CashflowItem[];
}

export interface CategoryBreakdown {
  category_id: number | null;
  category_name: string;
  total: number;
  percentage: number;
  transaction_count: number;
}

export interface CategoryBreakdownResponse {
  data: CategoryBreakdown[];
  period_total: number;
}

export interface BalancePoint {
  date: string;
  balance: number;
}

export interface BalanceHistoryResponse {
  data: BalancePoint[];
}

export interface ForecastPoint {
  date: string;
  predicted: number;
  lower_bound: number;
  upper_bound: number;
}

export interface ForecastResponse {
  data: ForecastPoint[];
}
