/**
 * Analytics API service.
 */
import api from "./api";
import type {
  BalanceHistoryResponse,
  CashflowResponse,
  CategoryBreakdownResponse,
  ForecastResponse,
} from "../types/analytics.types";

export const analyticsService = {
  async getCashflow(months = 12, accountId?: number): Promise<CashflowResponse> {
    const response = await api.get("/analytics/cashflow", {
      params: { months, account_id: accountId },
    });
    return response.data;
  },

  async getByCategory(dateFrom?: string, dateTo?: string, accountId?: number): Promise<CategoryBreakdownResponse> {
    const response = await api.get("/analytics/by-category", {
      params: { date_from: dateFrom, date_to: dateTo, account_id: accountId },
    });
    return response.data;
  },

  async getBalanceHistory(months = 12, accountId?: number): Promise<BalanceHistoryResponse> {
    const response = await api.get("/analytics/balance-history", {
      params: { months, account_id: accountId },
    });
    return response.data;
  },

  async getForecast(months = 3): Promise<ForecastResponse> {
    const response = await api.get("/analytics/forecast", { params: { months } });
    return response.data;
  },
};
