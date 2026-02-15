/**
 * RegisterPage — redirects to Keycloak registration.
 *
 * Since registration is handled by Keycloak, this page acts as a redirect.
 * It also shows a brief landing UI while the redirect happens.
 */
import { useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";

export default function RegisterPage() {
  const { register } = useAuth();

  useEffect(() => {
    register();
  }, [register]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl">
          MF
        </div>
        <span className="text-sm text-muted-foreground">
          Redirection vers la creation de compte...
        </span>
      </div>
    </div>
  );
}
