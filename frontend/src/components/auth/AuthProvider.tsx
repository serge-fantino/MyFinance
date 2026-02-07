/**
 * AuthProvider — restores the user session on app startup.
 *
 * Must wrap the entire app ABOVE the router so that AuthGuard/GuestGuard
 * can read isLoading/isAuthenticated from the store without deadlocking.
 *
 * The problem it solves: Guards check isLoading from the store, but the
 * logic that sets isLoading=false was inside useAuth() which only runs
 * when a page component mounts — but Guards block page mounting while
 * isLoading is true. Classic chicken-and-egg.
 */
import { useEffect } from "react";
import { useAuthStore } from "../../store/auth.store";
import { authService } from "../../services/auth.service";
import api from "../../services/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, isLoading } = useAuthStore();

  useEffect(() => {
    const restoreSession = async () => {
      if (!authService.hasToken()) {
        setUser(null); // sets isLoading: false
        return;
      }

      // Set default Authorization header immediately (covers any request that happens
      // before interceptors run / during initial rendering).
      const token = localStorage.getItem("access_token");
      if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
      }

      try {
        const profile = await authService.getProfile();
        setUser(profile); // sets isLoading: false
      } catch {
        // Token invalid/expired, refresh interceptor already tried
        authService.logout();
        setUser(null); // sets isLoading: false
      }
    };

    restoreSession();
  }, [setUser]);

  // Show a full-screen loader while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl">
            MF
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 animate-spin text-primary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm text-muted-foreground">Chargement...</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
