/**
 * GuestGuard — redirects authenticated users away from login/register pages.
 *
 * Note: isLoading is handled by AuthProvider at the top level,
 * so by the time this component renders, auth state is resolved.
 */
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";

interface GuestGuardProps {
  children: React.ReactNode;
}

export function GuestGuard({ children }: GuestGuardProps) {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
