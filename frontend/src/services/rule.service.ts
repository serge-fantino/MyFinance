/**
 * Classification rules API service.
 */
import api from "./api";
import type {
  ApplyRulesResult,
  ClassificationRule,
  RuleCreate,
  RuleUpdate,
} from "../types/rule.types";

export const ruleService = {
  async list(): Promise<ClassificationRule[]> {
    const response = await api.get("/classification-rules");
    return response.data;
  },

  async create(data: RuleCreate): Promise<ClassificationRule> {
    const response = await api.post("/classification-rules", data);
    return response.data;
  },

  async update(id: number, data: RuleUpdate): Promise<ClassificationRule> {
    const response = await api.patch(`/classification-rules/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/classification-rules/${id}`);
  },

  async apply(accountId?: number): Promise<ApplyRulesResult> {
    const response = await api.post("/classification-rules/apply", null, {
      params: accountId ? { account_id: accountId } : {},
    });
    return response.data;
  },
};
