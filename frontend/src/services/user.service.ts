/**
 * User account API: password, sessions, delete account.
 */
import api from "./api";
import { getFingerprint } from "../utils/fingerprint";

export interface Session {
  id: number;
  ip_address: string | null;
  fingerprint: string | null;
  device_info: string | null;  // e.g. "Chrome 120 sur macOS 14.0 (Ordinateur)"
  created_at: string | null;
  last_used_at: string | null;
}

export const userService = {
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post("/users/me/password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  async listSessions(): Promise<Session[]> {
    const headers: Record<string, string> = {};
    headers["X-Client-Fingerprint"] = getFingerprint();
    const { data } = await api.get<Session[]>("/users/me/sessions", { headers });
    return data;
  },

  async revokeSession(sessionId: number): Promise<void> {
    await api.delete(`/users/me/sessions/${sessionId}`);
  },

  async deleteAccount(confirmation: string): Promise<void> {
    await api.delete("/users/me", {
      data: { confirmation },
    });
  },
};
