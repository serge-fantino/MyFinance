export interface Account {
  id: number;
  name: string;
  type: string;
  currency: string;
  bank_name: string | null;
  initial_balance: number;
  color: string | null;
  status: string;
  current_balance?: number;
  created_at: string;
}

export interface AccountCreate {
  name: string;
  type: string;
  currency?: string;
  bank_name?: string;
  initial_balance?: number;
  color?: string;
}

export interface AccountUpdate {
  name?: string;
  type?: string;
  currency?: string;
  bank_name?: string;
  color?: string;
  status?: string;
}

export interface AccountSummary {
  total_balance: number;
  total_accounts: number;
  accounts: Account[];
}
