/**
 * AI Chat API service.
 *
 * v2: supports dataviz query engine — charts come as {viz, data} pairs
 * from the backend, with data queried by the query engine (not the LLM).
 */
import api from "./api";
import type { ChartResult, VizSpec } from "../components/chat/ChatChart";

export type { ChartResult, VizSpec };

export interface ChatMessage {
  content: string;
  conversation_id?: number;
  account_ids?: number[];  // scope ceiling from UI
  debug?: boolean;
}

export interface DebugBlockTrace {
  query: Record<string, unknown>;
  viz: Record<string, unknown>;
  sql: string | null;
  row_count: number | null;
  data_sample: Record<string, unknown>[];
  error: string | null;
  duration_ms: number | null;
}

export interface DebugInfo {
  llm_raw_response: string;
  dataviz_blocks_found: number;
  account_scope: number[];
  block_traces: DebugBlockTrace[];
  system_prompt_length: number;
  llm_duration_ms: number | null;
  error: string | null;
}

export interface ChatResponse {
  conversation_id: number;
  message: string;
  charts: ChartResult[];
  metadata?: {
    provider?: string;
  };
  debug?: DebugInfo | null;
  error?: string | null;
}

export interface MessageItem {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail {
  id: number;
  title: string;
  messages: MessageItem[];
  created_at: string;
}

export interface ProviderStatus {
  provider: string;
  available: boolean;
}

export const aiService = {
  async chat(message: ChatMessage): Promise<ChatResponse> {
    const response = await api.post("/ai/chat", message);
    return response.data;
  },

  async listConversations(): Promise<Conversation[]> {
    const response = await api.get("/ai/conversations");
    return response.data;
  },

  async getConversation(id: number): Promise<ConversationDetail> {
    const response = await api.get(`/ai/conversations/${id}`);
    return response.data;
  },

  async deleteConversation(id: number): Promise<void> {
    await api.delete(`/ai/conversations/${id}`);
  },

  async getProviderStatus(): Promise<ProviderStatus> {
    const response = await api.get("/ai/status");
    return response.data;
  },
};
