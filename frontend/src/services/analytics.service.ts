/**
 * Analytics API service.
 */
import api from "./api";

export interface CategoryBreakdown {
  category_id: number | null;
  category_name: string;
  parent_id: number | null;
  parent_name: string | null;
  total: number;
  count: number;
  percentage: number;
}

export interface AnalyticsFilters {
  account_id?: number;
  date_from?: string;
  date_to?: string;
  direction?: "income" | "expense";
}

export interface LabelGroup {
  label: string;
  total: number;
  count: number;
  transactions: LabelTransaction[];
}

export interface LabelTransaction {
  id: number;
  date: string;
  label_raw: string;
  label_clean: string | null;
  amount: number;
  currency: string;
  category_id: number | null;
  ai_confidence: string | null;
}

export const analyticsService = {
  async byCategory(filters: AnalyticsFilters = {}): Promise<CategoryBreakdown[]> {
    const response = await api.get("/analytics/by-category", { params: filters });
    return response.data;
  },

  async categoryDetail(
    categoryId: number | null,
    filters: AnalyticsFilters = {},
  ): Promise<LabelGroup[]> {
    const params: Record<string, any> = { ...filters };
    if (categoryId !== null) {
      params.category_id = categoryId;
    }
    // For uncategorized: don't send category_id param at all (backend defaults to None)
    const response = await api.get("/analytics/category-detail", { params });
    return response.data;
  },
};
