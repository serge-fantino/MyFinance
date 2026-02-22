/**
 * Transaction cluster API service.
 * Manages persistent clusters (transaction_clusters table).
 */
import api from "./api";
import type { TransactionCluster } from "../types/classification.types";

export interface ClusterTransaction {
  id: number;
  date: string;
  label_raw: string;
  label_clean: string | null;
  amount: number;
  category_id: number | null;
}

export const clusterService = {
  async list(accountId?: number, categoryId?: number): Promise<TransactionCluster[]> {
    const params: Record<string, number> = {};
    if (accountId != null) params.account_id = accountId;
    if (categoryId != null) params.category_id = categoryId;
    const response = await api.get<TransactionCluster[]>("/clusters", { params });
    return response.data;
  },

  async get(clusterId: number): Promise<TransactionCluster> {
    const response = await api.get<TransactionCluster>(`/clusters/${clusterId}`);
    return response.data;
  },

  async update(
    clusterId: number,
    data: {
      name?: string;
      description?: string;
      category_id?: number | null;
      rule_pattern?: string | null;
      match_type?: string | null;
      create_rule?: boolean;
    }
  ): Promise<TransactionCluster> {
    const response = await api.patch<TransactionCluster>(`/clusters/${clusterId}`, data);
    return response.data;
  },

  async recompute(clusterId: number): Promise<TransactionCluster> {
    const response = await api.post<TransactionCluster>(`/clusters/${clusterId}/recompute`);
    return response.data;
  },

  async getTransactions(clusterId: number): Promise<ClusterTransaction[]> {
    const response = await api.get<ClusterTransaction[]>(`/clusters/${clusterId}/transactions`);
    return response.data;
  },

  async createFromProposal(data: {
    proposal_cluster_id: number;
    name?: string;
    category_id?: number | null;
  }): Promise<TransactionCluster> {
    const response = await api.post<TransactionCluster>("/clusters/from-proposal", data);
    return response.data;
  },

  async delete(clusterId: number): Promise<void> {
    await api.delete(`/clusters/${clusterId}`);
  },

  async moveTransactions(
    targetClusterId: number,
    transactionIds: number[],
    fromClusterId: number
  ): Promise<TransactionCluster> {
    const response = await api.post<TransactionCluster>(
      `/clusters/${targetClusterId}/move-transactions`,
      { transaction_ids: transactionIds, from_cluster_id: fromClusterId }
    );
    return response.data;
  },

  async validatePattern(
    transactionIds: number[],
    rulePattern: string,
    matchType: string
  ): Promise<{ match_count: number; total: number; matched_ids: number[]; unmatched: { id: number; label_raw: string }[] }> {
    const response = await api.post("/clusters/validate-pattern", {
      transaction_ids: transactionIds,
      rule_pattern: rulePattern,
      match_type: matchType,
    });
    return response.data;
  },

  async suggestName(transactionIds: number[]): Promise<{ suggested_name: string }> {
    const params = new URLSearchParams();
    params.set("transaction_ids", transactionIds.join(","));
    const response = await api.get<{ suggested_name: string }>(`/clusters/suggest-name?${params}`);
    return response.data;
  },

  async suggestPattern(transactionIds: number[]): Promise<{ suggested_pattern: string; match_type: string }> {
    const params = new URLSearchParams();
    params.set("transaction_ids", transactionIds.join(","));
    const response = await api.get<{ suggested_pattern: string; match_type: string }>(
      `/clusters/suggest-pattern?${params}`
    );
    return response.data;
  },

  async createFromSelection(data: {
    transaction_ids: number[];
    name: string;
    category_id?: number | null;
    description?: string | null;
    rule_pattern?: string | null;
    match_type?: string;
    create_rule?: boolean;
  }): Promise<TransactionCluster> {
    const response = await api.post<TransactionCluster>("/clusters/from-selection", data);
    return response.data;
  },
};
