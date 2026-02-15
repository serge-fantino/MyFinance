/**
 * Axios instance configured with Keycloak auth interceptors.
 *
 * The access token is fetched from the Keycloak adapter (not localStorage).
 * On 401, we attempt to refresh the token via Keycloak before retrying.
 */
import axios, { AxiosHeaders } from "axios";
import keycloak from "../lib/keycloak";

const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach Keycloak access token
api.interceptors.request.use(async (config) => {
  if (keycloak.authenticated) {
    // Refresh the token if it expires within 30 seconds
    try {
      await keycloak.updateToken(30);
    } catch {
      // Token refresh failed — Keycloak will handle re-login
    }

    const token = keycloak.token;
    if (token) {
      if (!config.headers) {
        config.headers = new AxiosHeaders();
      }
      if (config.headers instanceof AxiosHeaders) {
        config.headers.set("Authorization", `Bearer ${token}`);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
    }
  }
  return config;
});

// Response interceptor: handle 401 (token expired)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalRequest: any = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh the token via Keycloak
        const refreshed = await keycloak.updateToken(-1); // Force refresh
        if (refreshed && keycloak.token) {
          if (!originalRequest.headers) originalRequest.headers = {};
          originalRequest.headers.Authorization = `Bearer ${keycloak.token}`;
          return api(originalRequest);
        }
      } catch {
        // Refresh failed — redirect to Keycloak login
        keycloak.login();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
