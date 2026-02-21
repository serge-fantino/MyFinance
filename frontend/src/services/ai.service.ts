/**
 * AI Chat API service.
 */
import api from "./api";

export interface ChatMessage {
  content: string;
  conversation_id?: number;
}

export interface ChatResponse {
  conversation_id: number;
  message: string;
  metadata?: {
    charts?: Record<string, ChartData>;
    provider?: string;
  };
}

export interface ChartData {
  type: "bar" | "pie" | "area" | "kpi";
  title: string;
  data: Record<string, unknown>[];
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
