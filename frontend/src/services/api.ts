/**
 * Axios instance configured with Cognito auth interceptors.
 *
 * The access token is fetched from Cognito adapter (localStorage).
 * On 401, we attempt to refresh the token before retrying.
 */
import axios, { AxiosHeaders } from "axios";
import { cognito } from "../lib/cognito";

const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach Cognito access token
api.interceptors.request.use((config) => {
  const token = cognito.accessToken;
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
        const tokens = await cognito.refreshTokens();
        if (tokens) {
          if (!originalRequest.headers) originalRequest.headers = {};
          originalRequest.headers.Authorization = `Bearer ${tokens.access_token}`;
          return api(originalRequest);
        }
      } catch {
        // Refresh failed
      }

      // Redirect to Cognito login
      cognito.login();
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

export default api;
