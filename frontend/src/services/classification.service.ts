/**
 * Classification proposal API service.
 * One proposal per account, stored on the server.
 */
import api from "./api";
import type {
  ClassificationProposalResponse,
  ReclusterDebug,
} from "../types/classification.types";

export const classificationService = {
  async getProposal(accountId: number): Promise<ClassificationProposalResponse | null> {
    const response = await api.get<ClassificationProposalResponse | null>("/classification", {
      params: { account_id: accountId },
    });
    return response.data;
  },

  async recalculate(accountId: number, distanceThreshold: number): Promise<ClassificationProposalResponse> {
    const response = await api.post<ClassificationProposalResponse>("/classification/recalculate", {
      account_id: accountId,
      distance_threshold: distanceThreshold,
    });
    return response.data;
  },

  async patchProposal(
    accountId: number,
    clusterUpdates: Array<{
      cluster_id: number;
      status?: string;
      override_category_id?: number | null;
      rule_pattern?: string | null;
      custom_label?: string | null;
      excluded_ids?: number[];
    }>
  ): Promise<ClassificationProposalResponse | null> {
    const response = await api.patch<ClassificationProposalResponse | null>("/classification", {
      account_id: accountId,
      cluster_updates: clusterUpdates,
    });
    return response.data;
  },

  async applyCluster(
    clusterId: number,
    data: {
      transaction_ids: number[];
      category_id: number;
      create_rule?: boolean;
      rule_pattern?: string;
      custom_label?: string;
    }
  ): Promise<{ classified_count: number; rule_created: boolean }> {
    const response = await api.post(`/classification/clusters/${clusterId}/apply`, data);
    return response.data;
  },

  async reclusterCluster(
    clusterId: number,
    distanceThreshold?: number
  ): Promise<{ proposal: ClassificationProposalResponse; debug: ReclusterDebug }> {
    const response = await api.post<{ proposal: ClassificationProposalResponse; debug: ReclusterDebug }>(
      `/classification/clusters/${clusterId}/recluster`,
      distanceThreshold != null ? { distance_threshold: distanceThreshold } : {}
    );
    return response.data;
  },
};
