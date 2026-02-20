import { useMemo } from "react";
import type { Account } from "../../types/account.types";
import type { Category } from "../../types/category.types";

export interface FilterState {
  accountId: string;
  direction: "" | "income" | "expense";
  categoryId: string;
  datePreset: "all" | "month" | "range";
  dateFrom: string;
  dateTo: string;
  search: string;
}

interface TransactionFiltersProps {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  accounts: Account[];
  categories: Category[];
  /** Appelé à l’ouverture du menu catégorie pour rafraîchir la liste (ex. après modification dans la sidebar). */
  onCategoryDropdownOpen?: () => void;
  /** Plage de dates des données (première à dernière transaction) — pour préremplir "Période" */
  dateRange?: { minDate: string; maxDate: string } | null;
}

export function TransactionFilters({
  filters,
  onChange,
  accounts,
  categories,
  onCategoryDropdownOpen,
  dateRange,
}: TransactionFiltersProps) {
  // Flatten categories for select
  const flatCategories = useMemo(() => {
    const flat: { id: number; name: string; depth: number }[] = [];
    const walk = (cats: Category[], depth: number) => {
      for (const c of cats) {
        flat.push({ id: c.id, name: c.name, depth });
        if (c.children?.length) walk(c.children, depth + 1);
      }
    };
    walk(categories, 0);
    return flat;
  }, [categories]);

  // Generate month options from the last 24 months
  const monthOptions = useMemo(() => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      months.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return months;
  }, []);

  const handleDatePresetChange = (preset: "all" | "month" | "range") => {
    if (preset === "all") {
      onChange({ datePreset: "all", dateFrom: "", dateTo: "" });
    } else if (preset === "month") {
      // Default to current month
      const now = new Date();
      const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const from = `${m}-01`;
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const to = endDate.toISOString().slice(0, 10);
      onChange({ datePreset: "month", dateFrom: from, dateTo: to });
    } else {
      // Période: préremplir avec première et dernière transaction
      if (dateRange) {
        onChange({ datePreset: "range", dateFrom: dateRange.minDate, dateTo: dateRange.maxDate });
      } else {
        onChange({ datePreset: "range" });
      }
    }
  };

  const handleMonthSelect = (monthStr: string) => {
    if (!monthStr) return;
    const [y, m] = monthStr.split("-").map(Number);
    const from = `${monthStr}-01`;
    const endDate = new Date(y, m, 0);
    const to = endDate.toISOString().slice(0, 10);
    onChange({ dateFrom: from, dateTo: to });
  };

  const selectClass =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="bg-card border rounded-xl px-4 py-3 space-y-3">
      {/* Row 1: account, direction, category, search */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Account filter */}
        <select
          value={filters.accountId}
          onChange={(e) => onChange({ accountId: e.target.value })}
          className={`${selectClass} w-44`}
        >
          <option value="">Tous les comptes</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {/* Direction filter (income/expense) */}
        <div className="flex rounded-md border border-input overflow-hidden">
          {[
            { val: "", label: "Tout" },
            { val: "income", label: "Revenus" },
            { val: "expense", label: "Dépenses" },
          ].map((opt) => (
            <button
              key={opt.val}
              className={`px-3 h-8 text-sm transition-colors ${
                filters.direction === opt.val
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              onClick={() => onChange({ direction: opt.val as FilterState["direction"] })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <select
          value={filters.categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
          onFocus={() => onCategoryDropdownOpen?.()}
          className={`${selectClass} w-44`}
        >
          <option value="">Toutes catégories</option>
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {"\u00A0\u00A0".repeat(c.depth)}
              {c.name}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="flex flex-1 min-w-[180px] max-w-sm">
          <input
            type="text"
            placeholder="Rechercher..."
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") onChange({ search: "" });
            }}
            className={`${selectClass} w-full rounded-r-none`}
          />
          {filters.search && (
            <button
              onClick={() => onChange({ search: "" })}
              className="h-8 px-2 border border-l-0 border-input rounded-r-md bg-background hover:bg-muted text-muted-foreground"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: date filtering */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Date preset tabs */}
        <div className="flex rounded-md border border-input overflow-hidden">
          {(
            [
              { val: "all", label: "Toutes dates" },
              { val: "month", label: "Mois" },
              { val: "range", label: "Période" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.val}
              className={`px-3 h-8 text-sm transition-colors ${
                filters.datePreset === opt.val
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              onClick={() => handleDatePresetChange(opt.val)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Month selector */}
        {filters.datePreset === "month" && (
          <select
            value={filters.dateFrom ? filters.dateFrom.slice(0, 7) : ""}
            onChange={(e) => handleMonthSelect(e.target.value)}
            className={`${selectClass} w-52`}
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        )}

        {/* Date range inputs */}
        {filters.datePreset === "range" && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Du</span>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onChange({ dateFrom: e.target.value })}
                className={`${selectClass} w-36`}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">au</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onChange({ dateTo: e.target.value })}
                className={`${selectClass} w-36`}
              />
            </div>
          </>
        )}

        {/* Active filter summary */}
        {(filters.dateFrom || filters.dateTo) && filters.datePreset !== "all" && (
          <button
            className="text-xs text-primary hover:underline ml-auto"
            onClick={() => onChange({ datePreset: "all", dateFrom: "", dateTo: "" })}
          >
            Réinitialiser les dates
          </button>
        )}
      </div>
    </div>
  );
}
