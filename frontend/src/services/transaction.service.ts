/**
 * Transaction API service.
 */
import api from "./api";
import type {
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

  async import(accountId: number, file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/transactions/import?account_id=${accountId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
};
