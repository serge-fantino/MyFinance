/**
 * Authentication hook — provides login, register, logout actions via Cognito.
 *
 * Login and register redirect to the Cognito Hosted UI.
 * Logout clears the local store and calls Cognito logout.
 */
import { useCallback } from "react";
import { useAuthStore } from "../store/auth.store";
import { cognito } from "../lib/cognito";

export function useAuth() {
  const { user, isAuthenticated, logout: clearStore } = useAuthStore();

  const login = useCallback(() => {
    cognito.login();
  }, []);

  const register = useCallback(() => {
    cognito.register();
  }, []);

  const logout = useCallback(() => {
    clearStore();
    cognito.logout();
  }, [clearStore]);

  return {
    user,
    isAuthenticated,
    login,
    register,
    logout,
  };
}
