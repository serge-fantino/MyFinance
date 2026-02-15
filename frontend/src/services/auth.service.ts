/**
 * Authentication API service.
 *
 * With Keycloak, login/register/logout are handled by the IdP.
 * This service only fetches the local user profile from the backend.
 */
import api from "./api";
import type { User } from "../types/auth.types";

export const authService = {
  /** Fetch (or auto-provision) the local user from the backend. */
  async getProfile(): Promise<User> {
    const response = await api.get("/auth/me");
    return response.data;
  },
};
