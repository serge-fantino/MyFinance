/**
 * AuthGuard — protects routes that require authentication.
 * Redirects to /login if not authenticated.
 *
 * Note: isLoading is handled by AuthProvider at the top level,
 * so by the time this component renders, auth state is resolved.
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
