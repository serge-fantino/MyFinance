/**
 * Authentication hook — provides login, register, logout actions via Keycloak.
 *
 * Login and register redirect to the Keycloak UI.
 * Logout clears the local store and calls Keycloak logout.
 */
import { useCallback } from "react";
import { useAuthStore } from "../store/auth.store";
import keycloak from "../lib/keycloak";

export function useAuth() {
  const { user, isAuthenticated, logout: clearStore } = useAuthStore();

  const login = useCallback(() => {
    keycloak.login({ redirectUri: window.location.origin + "/dashboard" });
  }, []);

  const register = useCallback(() => {
    keycloak.register({ redirectUri: window.location.origin + "/dashboard" });
  }, []);

  const logout = useCallback(() => {
    clearStore();
    keycloak.logout({ redirectUri: window.location.origin + "/login" });
  }, [clearStore]);

  const accountManagement = useCallback(() => {
    keycloak.accountManagement();
  }, []);

  return {
    user,
    isAuthenticated,
    login,
    register,
    logout,
    accountManagement,
  };
}
