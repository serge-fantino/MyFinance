/**
 * Authentication hook — provides login, register, logout actions.
 *
 * Session restoration is handled by AuthProvider (in main.tsx).
 * This hook is for user-triggered auth actions only.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";
import { authService } from "../services/auth.service";
import type { LoginRequest, RegisterRequest } from "../types/auth.types";

export function useAuth() {
  const { user, isAuthenticated, setUser, logout: clearStore } = useAuthStore();
  const navigate = useNavigate();

  const login = useCallback(
    async (data: LoginRequest) => {
      const authData = await authService.login(data);
      setUser(authData.user);
      navigate("/dashboard");
    },
    [navigate, setUser]
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      const authData = await authService.register(data);
      setUser(authData.user);
      navigate("/dashboard");
    },
    [navigate, setUser]
  );

  const logout = useCallback(() => {
    authService.logout();
    clearStore();
    navigate("/login");
  }, [navigate, clearStore]);

  return {
    user,
    isAuthenticated,
    login,
    register,
    logout,
  };
}
