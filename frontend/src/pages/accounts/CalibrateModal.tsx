import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { accountService } from "../../services/account.service";
import type { Account } from "../../types/account.types";

interface CalibrateModalProps {
  account: Account;
  onClose: (refreshNeeded: boolean) => void;
}

export function CalibrateModal({ account, onClose }: CalibrateModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(account.balance_reference_date || today);
  const [amount, setAmount] = useState(
    account.balance_reference_amount != null
      ? String(account.balance_reference_amount)
      : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      setError("Veuillez entrer un montant valide.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await accountService.calibrate(account.id, date, numAmount);
      onClose(true);
    } catch {
      setError("Erreur lors de la calibration du solde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold mb-1">Calibrer le solde</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Indiquez le solde connu de <strong>{account.name}</strong> a une date donnee.
          Le systeme calculera automatiquement le solde initial du compte.
        </p>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date de reference</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Solde a cette date ({account.currency})
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex: 1234.56"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onClose(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Calibrer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
