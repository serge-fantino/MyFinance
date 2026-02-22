import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { userService, type Session } from "../../services/user.service";
import { authService } from "../../services/auth.service";
import { useAuth } from "../../hooks/useAuth";

export default function UserAccountPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mon compte</h1>
        <p className="text-muted-foreground mt-1">
          Gérez votre mot de passe, vos sessions et votre compte.
        </p>
      </div>

      <ChangePasswordSection />
      <SessionsSection />
      <DeleteAccountSection onDeleted={() => { authService.logout(); logout(); navigate("/login"); }} />
    </div>
  );
}

/* ===========================================================================
   Change Password
   =========================================================================== */

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setLoading(true);
    try {
      await userService.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e && e.response && typeof e.response === "object" && "data" in e.response
          ? (e.response as { data?: { detail?: string } }).data?.detail
          : null;
      setError(msg || "Erreur lors du changement de mot de passe.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Modifier le mot de passe</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {success && (
          <Alert variant="default" className="mb-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            Mot de passe modifié avec succès.
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Mot de passe actuel</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground mt-0.5">
              Au moins 8 caractères, une majuscule et un chiffre.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <Button type="submit" disabled={loading} isLoading={loading}>
            Modifier le mot de passe
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ===========================================================================
   Sessions (connections)
   =========================================================================== */

function SessionsSection() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await userService.listSessions();
      setSessions(data);
    } catch {
      setError("Impossible de charger les sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = async (sessionId: number) => {
    setRevokingId(sessionId);
    try {
      await userService.revokeSession(sessionId);
      setSessions((s) => s.filter((x) => x.id !== sessionId));
      // Force an auth check: if we revoked our own session, this triggers 401 → redirect to login
      await authService.getProfile();
    } catch {
      setError("Impossible de révoquer la session.");
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sessions actives</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Liste des appareils connectés à votre compte. Révoquez une session pour déconnecter cet appareil.
        </p>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune session enregistrée.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg border bg-muted/30"
              >
                <div className="text-sm">
                  <p>
                    <span className="font-medium">{s.device_info || "Session"}</span>
                    {s.ip_address && (
                      <span className="ml-2 text-muted-foreground text-xs">
                        · IP : {s.ip_address}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Créée le {formatDate(s.created_at)} · Dernière activité : {formatDate(s.last_used_at)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevoke(s.id)}
                  disabled={revokingId === s.id}
                  isLoading={revokingId === s.id}
                >
                  Révoquer
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ===========================================================================
   Delete Account
   =========================================================================== */

function DeleteAccountSection({ onDeleted }: { onDeleted: () => void }) {
  const [step, setStep] = useState<"idle" | "confirm" | "type">("idle");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmation !== "SUPPRIMER") return;
    setLoading(true);
    setError(null);
    try {
      await userService.deleteAccount(confirmation);
      onDeleted();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "response" in e && e.response && typeof e.response === "object" && "data" in e.response
          ? (e.response as { data?: { detail?: string } }).data?.detail
          : null;
      setError(msg || "Erreur lors de la suppression du compte.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Supprimer mon compte</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Cette action est irréversible. Toutes vos données (transactions, comptes, clusters, règles, etc.) seront définitivement supprimées.
        </p>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

        {step === "idle" && (
          <Button variant="destructive" onClick={() => setStep("confirm")}>
            Supprimer mon compte
          </Button>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <Alert variant="destructive">
              Êtes-vous sûr ? Tapez <strong>SUPPRIMER</strong> pour confirmer.
            </Alert>
            <div>
              <label className="block text-sm font-medium mb-1">Confirmation</label>
              <input
                type="text"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value.toUpperCase())}
                placeholder="SUPPRIMER"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={confirmation !== "SUPPRIMER" || loading}
                isLoading={loading}
              >
                Supprimer définitivement
              </Button>
              <Button variant="outline" onClick={() => { setStep("idle"); setConfirmation(""); setError(null); }}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
