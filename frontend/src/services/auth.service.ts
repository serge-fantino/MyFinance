/**
 * Authentication API service.
 *
 * With Amazon Cognito, login/register/logout are handled by the IdP.
 * This service fetches/syncs the local user profile with the backend.
 */
import api from "./api";
import type { User } from "../types/auth.types";

export const authService = {
  /** Fetch (or auto-provision) the local user from the backend. */
  async getProfile(): Promise<User> {
    const response = await api.get("/auth/me");
    return response.data;
  },

  /** Sync user profile using Cognito ID token (contains email, name). */
  async syncProfile(idToken: string): Promise<User> {
    const response = await api.post("/auth/sync", { id_token: idToken });
    return response.data;
  },
};
