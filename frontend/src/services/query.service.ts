/**
 * Query module API — execute raw dataviz queries with full data model access.
 */
import api from "./api";
import type { ChartResult } from "../components/chat/ChatChart";

export interface MetamodelSource {
  name: string;
  description: string;
  fields: Array<{ name: string; type: string; description?: string; filterable?: boolean; aggregatable?: boolean }>;
  relations?: Array<{ target: string; description?: string }>;
}

export interface Metamodel {
  sources: MetamodelSource[];
  temporal_functions: string[];
  aggregate_functions: string[];
  filter_operators: string[];
  period_macros: Record<string, string>;
}

export interface QueryExecuteRequest {
  query: Record<string, unknown>;
  viz: Record<string, unknown>;
  account_ids?: number[] | null;
}

export interface QueryExecuteResponse {
  viz: Record<string, unknown>;
  data: Record<string, unknown>[];
  trace: {
    query: Record<string, unknown>;
    viz: Record<string, unknown>;
    sql: string | null;
    row_count: number;
    error: string | null;
  };
}

export const queryService = {
  async getMetamodel(): Promise<Metamodel> {
    const response = await api.get("/ai/metamodel");
    return response.data;
  },

  async execute(request: QueryExecuteRequest): Promise<QueryExecuteResponse> {
    const response = await api.post("/ai/query", request);
    return response.data;
  },

  /** Convert API response to ChartResult for ChatChart component */
  toChartResult(res: QueryExecuteResponse): ChartResult {
    return {
      viz: res.viz as ChartResult["viz"],
      data: res.data,
      trace: res.trace,
    };
  },
};
