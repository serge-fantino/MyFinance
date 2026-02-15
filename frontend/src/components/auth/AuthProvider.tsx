/**
 * AuthProvider — initializes Keycloak and restores the user session.
 *
 * Must wrap the entire app ABOVE the router so that AuthGuard/GuestGuard
 * can read isLoading/isAuthenticated from the store.
 *
 * Flow:
 * 1. Initialize keycloak-js with check-sso (silent check)
 * 2. If authenticated: fetch local user profile from backend → setUser
 * 3. If not authenticated: setUser(null) → isLoading becomes false
 */
import { useEffect, useRef } from "react";
import { useAuthStore } from "../../store/auth.store";
import { authService } from "../../services/auth.service";
import keycloak from "../../lib/keycloak";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, isLoading } = useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initKeycloak = async () => {
      try {
        const authenticated = await keycloak.init({
          onLoad: "check-sso",
          pkceMethod: "S256",
          silentCheckSsoRedirectUri:
            window.location.origin + "/silent-check-sso.html",
        });

        if (authenticated) {
          // Fetch (or auto-provision) the local user from backend
          try {
            const profile = await authService.getProfile();
            setUser(profile);
          } catch {
            // Backend unreachable or user provisioning failed
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Keycloak init failed", err);
        setUser(null);
      }
    };

    initKeycloak();
  }, [setUser]);

  // Show a full-screen loader while Keycloak initializes
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
