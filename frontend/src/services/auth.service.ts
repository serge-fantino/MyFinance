/**
 * Authentication API service.
 */
import api from "./api";
import type { AuthResponse, LoginRequest, RegisterRequest, User } from "../types/auth.types";

function storeTokens(authResponse: AuthResponse): void {
  localStorage.setItem("access_token", authResponse.access_token);
  localStorage.setItem("refresh_token", authResponse.refresh_token);
  // Also set default header to avoid any edge-case where interceptor doesn't run
  api.defaults.headers.common.Authorization = `Bearer ${authResponse.access_token}`;
}

export const authService = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await api.post("/auth/register", data);
    const authData: AuthResponse = response.data;
    storeTokens(authData);
    return authData;
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post("/auth/login", data);
    const authData: AuthResponse = response.data;
    storeTokens(authData);
    return authData;
  },

  async getProfile(): Promise<User> {
    const response = await api.get("/users/me");
    return response.data;
  },

  logout(): void {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    delete api.defaults.headers.common.Authorization;
  },

  hasToken(): boolean {
    return !!localStorage.getItem("access_token");
  },
};
