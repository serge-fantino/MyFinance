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
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
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

  async getConversation(id: number) {
    const response = await api.get(`/ai/conversations/${id}`);
    return response.data;
  },
};
