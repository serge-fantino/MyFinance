/**
 * AuthGuard — protects routes that require authentication.
 * Redirects to Keycloak login if not authenticated.
 *
 * Note: isLoading is handled by AuthProvider at the top level,
 * so by the time this component renders, auth state is resolved.
 */
import { useEffect } from "react";
import { useAuthStore } from "../../store/auth.store";
import keycloak from "../../lib/keycloak";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      keycloak.login({ redirectUri: window.location.href });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    // Show loading while redirecting to Keycloak
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-sm text-muted-foreground">Redirection vers la connexion...</span>
      </div>
    );
  }

  return <>{children}</>;
}
