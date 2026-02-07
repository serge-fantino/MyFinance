export interface ClassificationRule {
  id: number;
  user_id: number;
  pattern: string;
  match_type: string; // contains, exact, starts_with
  category_id: number;
  category_name: string | null;
  custom_label: string | null;
  priority: number;
  is_active: boolean;
  created_by: string; // manual, ai
  created_at: string;
  updated_at: string;
}

export interface RuleCreate {
  pattern: string;
  match_type?: string;
  category_id: number;
  custom_label?: string;
  priority?: number;
}

export interface RuleUpdate {
  pattern?: string;
  match_type?: string;
  category_id?: number;
  custom_label?: string;
  priority?: number;
  is_active?: boolean;
}

export interface ApplyRulesResult {
  applied: number;
  total_uncategorized: number;
}
