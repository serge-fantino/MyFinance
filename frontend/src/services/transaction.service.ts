/**
 * Transaction API service.
 */
import api from "./api";
import type {
  CashflowDaily,
  CashflowMonthly,
  ClassifyResult,
  ImportResult,
  PaginatedTransactions,
  Transaction,
  TransactionCreate,
  TransactionFilter,
  TransactionUpdate,
} from "../types/transaction.types";

export const transactionService = {
  async list(filters: TransactionFilter & { page?: number; per_page?: number }): Promise<PaginatedTransactions> {
    const response = await api.get("/transactions", { params: filters });
    return response.data;
  },

  async create(data: TransactionCreate): Promise<Transaction> {
    const response = await api.post("/transactions", data);
    return response.data;
  },

  async get(id: number): Promise<Transaction> {
    const response = await api.get(`/transactions/${id}`);
    return response.data;
  },

  async update(id: number, data: TransactionUpdate): Promise<Transaction> {
    const response = await api.patch(`/transactions/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/transactions/${id}`);
  },

  async getCashflowMonthly(accountId?: number): Promise<CashflowMonthly[]> {
    const response = await api.get("/transactions/cashflow", {
      params: { granularity: "monthly", ...(accountId ? { account_id: accountId } : {}) },
    });
    return response.data;
  },

  async getCashflowDaily(accountId?: number): Promise<CashflowDaily[]> {
    const response = await api.get("/transactions/cashflow", {
      params: { granularity: "daily", ...(accountId ? { account_id: accountId } : {}) },
    });
    return response.data;
  },

  async import(accountId: number, file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/transactions/import?account_id=${accountId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  async classify(accountId?: number): Promise<ClassifyResult> {
    const response = await api.post("/transactions/classify", null, {
      params: accountId ? { account_id: accountId } : {},
    });
    return response.data;
  },
};
