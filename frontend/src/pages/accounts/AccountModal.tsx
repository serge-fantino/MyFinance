import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import { accountService } from "../../services/account.service";
import { accountSchema, type AccountForm } from "../../utils/validators";
import type { Account } from "../../types/account.types";

interface AccountModalProps {
  account: Account | null;
  onClose: (refreshNeeded: boolean) => void;
}

const ACCOUNT_TYPES = [
  { value: "courant", label: "Compte courant" },
  { value: "epargne", label: "Epargne" },
  { value: "carte", label: "Carte de credit" },
  { value: "invest", label: "Investissement" },
];

const COLORS = ["#6366f1", "#22c55e", "#f97316", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#eab308"];

export function AccountModal({ account, onClose }: AccountModalProps) {
  const isEditing = !!account;
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: account?.name || "",
      type: (account?.type as AccountForm["type"]) || "courant",
      currency: account?.currency || "EUR",
      bank_name: account?.bank_name || "",
      initial_balance: account?.initial_balance || 0,
      color: account?.color || "#6366f1",
    },
  });

  const selectedColor = watch("color");

  const onSubmit = async (data: AccountForm) => {
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEditing) {
        await accountService.update(account.id, data);
      } else {
        await accountService.create(data);
      }
      onClose(true);
    } catch {
      setError(isEditing ? "Impossible de modifier le compte." : "Impossible de creer le compte.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={() => onClose(false)} />

      {/* Modal */}
      <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-1">
            {isEditing ? "Modifier le compte" : "Nouveau compte"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {isEditing ? "Modifiez les informations du compte." : "Ajoutez un nouveau compte bancaire."}
          </p>

          {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              id="name"
              label="Nom du compte"
              placeholder="ex: Compte courant BNP"
              error={errors.name?.message}
              {...register("name")}
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Type de compte</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register("type")}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                id="currency"
                label="Devise"
                placeholder="EUR"
                maxLength={3}
                error={errors.currency?.message}
                {...register("currency")}
              />
              <Input
                id="initial_balance"
                label="Solde initial"
                type="number"
                step="0.01"
                error={errors.initial_balance?.message}
                {...register("initial_balance", { valueAsNumber: true })}
              />
            </div>

            <Input
              id="bank_name"
              label="Banque (optionnel)"
              placeholder="ex: BNP Paribas"
              {...register("bank_name")}
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Couleur</label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValue("color", c)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      selectedColor === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onClose(false)}>
                Annuler
              </Button>
              <Button type="submit" className="flex-1" isLoading={isSubmitting}>
                {isEditing ? "Enregistrer" : "Creer le compte"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
