/**
 * Authentication API service.
 */
import api from "./api";
import type { LoginRequest, RegisterRequest, TokenResponse, User } from "../types/auth.types";

export const authService = {
  async register(data: RegisterRequest): Promise<User> {
    const response = await api.post("/auth/register", data);
    return response.data;
  },

  async login(data: LoginRequest): Promise<TokenResponse> {
    const response = await api.post("/auth/login", data);
    const tokens = response.data;

    localStorage.setItem("access_token", tokens.access_token);
    localStorage.setItem("refresh_token", tokens.refresh_token);

    return tokens;
  },

  async getProfile(): Promise<User> {
    const response = await api.get("/users/me");
    return response.data;
  },

  logout(): void {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/login";
  },
};
