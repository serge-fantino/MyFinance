/**
 * Transaction API service.
 */
import api from "./api";
import type {
  CashflowDaily,
  CashflowMonthly,
  ClusterClassifyRequest,
  ClusterClassifyResult,
  ClustersResponse,
  ComputeEmbeddingsResult,
  ImportPreviewResult,
  ImportResult,
  InterpretClusterRequest,
  InterpretClusterResult,
  LlmStatusResponse,
  PaginatedTransactions,
  ParseLabelsResult,
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

  async getCashflowMonthly(
    accountId?: number,
    filters?: { dateFrom?: string; dateTo?: string; categoryId?: number; direction?: string }
  ): Promise<CashflowMonthly[]> {
    const params: Record<string, unknown> = { granularity: "monthly" };
    if (accountId) params.account_id = accountId;
    if (filters?.dateFrom) params.date_from = filters.dateFrom;
    if (filters?.dateTo) params.date_to = filters.dateTo;
    if (filters?.categoryId) params.category_id = filters.categoryId;
    if (filters?.direction === "income") params.amount_min = 0.01;
    else if (filters?.direction === "expense") params.amount_max = -0.01;
    const response = await api.get("/transactions/cashflow", { params });
    return response.data;
  },

  async getCashflowDaily(
    accountId?: number,
    filters?: { dateFrom?: string; dateTo?: string; categoryId?: number; direction?: string }
  ): Promise<CashflowDaily[]> {
    const params: Record<string, unknown> = { granularity: "daily" };
    if (accountId) params.account_id = accountId;
    if (filters?.dateFrom) params.date_from = filters.dateFrom;
    if (filters?.dateTo) params.date_to = filters.dateTo;
    if (filters?.categoryId) params.category_id = filters.categoryId;
    if (filters?.direction === "income") params.amount_min = 0.01;
    else if (filters?.direction === "expense") params.amount_max = -0.01;
    const response = await api.get("/transactions/cashflow", { params });
    return response.data;
  },

  async getBalanceAtDate(date: string, accountId?: number): Promise<{ date: string; balance: number }> {
    const params: Record<string, unknown> = { date };
    if (accountId) params.account_id = accountId;
    const response = await api.get("/transactions/balance-at-date", { params });
    return response.data;
  },

  async importPreview(file: File): Promise<ImportPreviewResult> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/transactions/import/preview", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  async import(
    accountId: number,
    file: File,
    accountAction: "use" | "update" | "create" = "use",
    newAccountName?: string,
    applyBalanceReference?: boolean
  ): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams({
      account_id: String(accountId),
      account_action: accountAction,
    });
    if (newAccountName) params.set("new_account_name", newAccountName);
    if (applyBalanceReference) params.set("apply_balance_reference", "true");
    const response = await api.post(`/transactions/import?${params}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  // ── Label parsing & embedding classification ───────

  async parseLabels(accountId?: number, force = false): Promise<ParseLabelsResult> {
    const params: Record<string, unknown> = {};
    if (accountId) params.account_id = accountId;
    if (force) params.force = true;
    const response = await api.post("/transactions/parse-labels", null, { params });
    return response.data;
  },

  async computeEmbeddings(accountId?: number): Promise<ComputeEmbeddingsResult> {
    const response = await api.post("/transactions/compute-embeddings", null, {
      params: accountId ? { account_id: accountId } : {},
    });
    return response.data;
  },

  async getClusters(
    accountId?: number,
    minClusterSize?: number,
    distanceThreshold?: number
  ): Promise<ClustersResponse> {
    const params: Record<string, unknown> = {};
    if (accountId) params.account_id = accountId;
    if (minClusterSize) params.min_cluster_size = minClusterSize;
    if (distanceThreshold != null) params.distance_threshold = distanceThreshold;
    const response = await api.get("/transactions/clusters", { params });
    return response.data;
  },

  async classifyCluster(data: ClusterClassifyRequest): Promise<ClusterClassifyResult> {
    const response = await api.post("/transactions/clusters/classify", data);
    return response.data;
  },

  async interpretCluster(data: InterpretClusterRequest): Promise<InterpretClusterResult> {
    const response = await api.post("/transactions/clusters/interpret", data);
    return response.data;
  },

  async getLlmStatus(): Promise<LlmStatusResponse> {
    const response = await api.get("/transactions/clusters/llm-status");
    return response.data;
  },
};
