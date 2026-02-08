import { useState, useEffect } from "react";
import { Button } from "../../components/ui/Button";
import { formatCurrency } from "../../utils/format";
import type { Category } from "../../types/category.types";

export interface EditTransactionPayload {
  id: number;
  label_raw: string;
  label_clean: string | null;
  category_id: number | null;
  notes: string | null;
  amount?: number;
  currency?: string;
  date?: string;
}

interface EditTransactionModalProps {
  open: boolean;
  onClose: () => void;
  transaction: EditTransactionPayload | null;
  flatCategories: { id: number; name: string; depth: number }[];
  onSave: (id: number, data: { label_clean?: string; category_id?: number | null; notes?: string | null }) => Promise<void>;
  /** Appelé à l’ouverture du menu catégorie pour rafraîchir la liste. */
  onCategoryDropdownOpen?: () => void;
}

export function EditTransactionModal({
  open,
  onClose,
  transaction,
  flatCategories,
  onSave,
  onCategoryDropdownOpen,
}: EditTransactionModalProps) {
  const [labelClean, setLabelClean] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (transaction) {
      setLabelClean(transaction.label_clean ?? "");
      setCategoryId(transaction.category_id != null ? String(transaction.category_id) : "");
      setNotes(transaction.notes ?? "");
    }
  }, [transaction]);

  if (!open || !transaction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(transaction.id, {
        label_clean: labelClean.trim() || undefined,
        category_id: categoryId ? parseInt(categoryId) : null,
        notes: notes.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-txn-title"
      >
        <h2 id="edit-txn-title" className="text-lg font-semibold mb-4">
          Modifier la transaction
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Libellé original (lecture seule) */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Libellé original
            </label>
            <p className="text-sm rounded border border-input bg-muted/30 px-3 py-2 break-words">
              {transaction.label_raw}
            </p>
          </div>

          {/* Libellé personnalisé / automatique */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Libellé personnalisé
            </label>
            <input
              type="text"
              value={labelClean}
              onChange={(e) => setLabelClean(e.target.value)}
              placeholder="Ex: Salaire Serge, Courses Carrefour"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
          </div>

          {/* Catégorie */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Catégorie
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              onFocus={() => onCategoryDropdownOpen?.()}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Aucune —</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {"\u00A0\u00A0".repeat(cat.depth)}{cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes optionnelles"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Info montant / date si dispo */}
          {(transaction.amount != null || transaction.date) && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              {transaction.date && <span>Date : {transaction.date}</span>}
              {transaction.amount != null && transaction.currency && (
                <span>{formatCurrency(transaction.amount, transaction.currency)}</span>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
