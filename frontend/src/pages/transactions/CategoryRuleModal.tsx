import { useState, useEffect } from "react";
import { Button } from "../../components/ui/Button";

export interface CategoryRuleModalPayload {
  txnId: number;
  categoryId: number;
  categoryName: string;
  labelRaw: string;
  customLabel: string;
}

interface CategoryRuleModalProps {
  open: boolean;
  onClose: () => void;
  payload: CategoryRuleModalPayload | null;
  onCreateRule: (txnId: number, categoryId: number, pattern: string, customLabel?: string) => void;
  onApplyOnly: (txnId: number, categoryId: number, customLabel?: string) => void;
}

export function CategoryRuleModal({
  open,
  onClose,
  payload,
  onCreateRule,
  onApplyOnly,
}: CategoryRuleModalProps) {
  const [pattern, setPattern] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  useEffect(() => {
    if (payload) {
      setPattern(payload.labelRaw.trim());
      setCustomLabel(payload.customLabel || "");
    }
  }, [payload]);

  if (!open || !payload) return null;

  const handleCreateRule = () => {
    const p = pattern.trim();
    if (!p) return;
    onCreateRule(payload.txnId, payload.categoryId, p, customLabel.trim() || undefined);
    onClose();
  };

  const handleApplyOnly = () => {
    onApplyOnly(payload.txnId, payload.categoryId, customLabel.trim() || undefined);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-modal-title"
      >
        <h2 id="rule-modal-title" className="text-lg font-semibold mb-1">
          Catégoriser la transaction
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Vous pouvez créer une règle pour appliquer automatiquement cette catégorie aux
          transactions avec un libellé similaire, ou appliquer uniquement à cette transaction.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Catégorie
            </label>
            <p className="text-sm font-medium rounded border border-input bg-muted/30 px-3 py-2">
              {payload.categoryName}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Motif de la règle (optionnel)
            </label>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Ex: CARREFOUR, Salaire..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-describedby="rule-pattern-hint"
            />
            <p id="rule-pattern-hint" className="text-[11px] text-muted-foreground mt-1">
              Les transactions dont le libellé contient ce texte seront catégorisées automatiquement.
              Par défaut : le libellé complet de la transaction.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Libellé personnalisé (optionnel)
            </label>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Ex: Salaire Serge, Courses Carrefour"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-6">
          <Button
            onClick={handleCreateRule}
            disabled={!pattern.trim()}
            className="w-full"
          >
            Créer la règle et appliquer aux transactions similaires
          </Button>
          <Button
            variant="outline"
            onClick={handleApplyOnly}
            className="w-full"
          >
            Appliquer uniquement à cette transaction
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground py-1"
          >
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}
