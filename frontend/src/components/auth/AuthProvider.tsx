/**
 * AuthProvider — restores the user session from Cognito tokens.
 *
 * Must wrap the entire app ABOVE the router so that AuthGuard/GuestGuard
 * can read isLoading/isAuthenticated from the store.
 *
 * Flow:
 * 1. Check if we have tokens in localStorage (returning user)
 * 2. If yes: attempt to refresh, fetch local profile → setUser
 * 3. If no: setUser(null) → isLoading becomes false
 */
import { useEffect, useRef } from "react";
import { useAuthStore } from "../../store/auth.store";
import { authService } from "../../services/auth.service";
import { cognito } from "../../lib/cognito";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, isLoading } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const restoreSession = async () => {
      try {
        if (cognito.isAuthenticated) {
          // Try to refresh tokens (they might be expired)
          const tokens = await cognito.refreshTokens();
          if (tokens) {
            // Sync profile with ID token and fetch user
            const profile = await authService.syncProfile(tokens.id_token);
            setUser(profile);
            return;
          }

          // Refresh failed but we still have tokens — try using them
          try {
            const profile = await authService.getProfile();
            setUser(profile);
            return;
          } catch {
            // Tokens are invalid, clear them
            cognito.clearTokens();
          }
        }

        setUser(null);
      } catch (err) {
        console.error("Session restore failed", err);
        cognito.clearTokens();
        setUser(null);
      }
    };

    restoreSession();
  }, [setUser]);

  // Show a full-screen loader while checking auth state
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
