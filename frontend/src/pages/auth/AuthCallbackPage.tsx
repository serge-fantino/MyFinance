/**
 * AuthCallbackPage — handles the OAuth2 callback from Cognito Hosted UI.
 *
 * After the user logs in via Cognito, they are redirected here with an
 * authorization code. This page exchanges the code for tokens, syncs the
 * user profile, and redirects to the dashboard.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cognito } from "../../lib/cognito";
import { authService } from "../../services/auth.service";
import { useAuthStore } from "../../store/auth.store";

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const code = searchParams.get("code");
    if (!code) {
      setError("Code d'autorisation manquant");
      return;
    }

    const handleCallback = async () => {
      try {
        // Exchange authorization code for tokens
        const tokens = await cognito.handleCallback(code);

        // Sync user profile with backend (ID token has email/name)
        const profile = await authService.syncProfile(tokens.id_token);
        setUser(profile);

        // Redirect to dashboard
        navigate("/dashboard", { replace: true });
      } catch (err) {
        console.error("Auth callback failed", err);
        setError("Erreur d'authentification. Veuillez reessayer.");
        cognito.clearTokens();
      }
    };

    handleCallback();
  }, [searchParams, navigate, setUser]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => cognito.login()}
            className="text-sm text-primary hover:underline"
          >
            Reessayer la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl">
          MF
        </div>
        <span className="text-sm text-muted-foreground">Connexion en cours...</span>
      </div>
    </div>
  );
}
