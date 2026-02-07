/**
 * Axios instance configured with auth interceptors.
 */
import axios, { AxiosHeaders } from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// Ensure Authorization is set as early as possible (page refresh, HMR, etc.)
try {
  const bootToken = localStorage.getItem("access_token");
  if (bootToken) {
    api.defaults.headers.common.Authorization = `Bearer ${bootToken}`;
  }
} catch {
  // localStorage may be unavailable in some environments; ignore.
}

// Request interceptor: attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    // Axios v1 may use AxiosHeaders internally; set in a compatible way.
    if (!config.headers) {
      config.headers = new AxiosHeaders();
    }
    if (config.headers instanceof AxiosHeaders) {
      config.headers.set("Authorization", `Bearer ${token}`);
    } else {
      // Fallback for plain object headers
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
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) throw new Error("No refresh token");

        const { data } = await axios.post("/api/v1/auth/refresh", null, {
          params: { refresh_token: refreshToken },
        });

        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);

        // Update defaults for next requests
        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;

        // Ensure the retried request has the header too
        if (!originalRequest.headers) originalRequest.headers = {};
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
