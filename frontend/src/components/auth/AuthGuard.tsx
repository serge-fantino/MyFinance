/**
 * AuthGuard — protects routes that require authentication.
 * Redirects to Cognito login if not authenticated.
 *
 * Note: isLoading is handled by AuthProvider at the top level,
 * so by the time this component renders, auth state is resolved.
 */
import { useEffect } from "react";
import { useAuthStore } from "../../store/auth.store";
import { cognito } from "../../lib/cognito";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      cognito.login();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-sm text-muted-foreground">Redirection vers la connexion...</span>
      </div>
    );
  }

  return <>{children}</>;
}
