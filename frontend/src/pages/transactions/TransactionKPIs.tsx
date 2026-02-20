import { formatCurrency } from "../../utils/format";

interface TransactionKPIsProps {
  /** Total count of transactions matching the current filters (from API meta) */
  filteredCount: number;
  /** Sum of positive amounts matching the current filters */
  filteredIncome: number;
  /** Sum of negative amounts (absolute) matching the current filters */
  filteredExpenses: number;
  /** Net = income - expenses (différence sur la période) */
  filteredNet: number;
  /** Balance at balanceDate */
  balanceAtDate?: number | null;
  /** Date used for balance (dateTo or today) */
  balanceDate: string;
  /** True when a date filter is applied */
  hasDateFilter: boolean;
}

export function TransactionKPIs({
  filteredCount,
  filteredIncome,
  filteredExpenses,
  filteredNet,
  balanceAtDate,
  balanceDate,
  hasDateFilter,
}: TransactionKPIsProps) {
  const balanceLabel = hasDateFilter
    ? `Solde au ${new Date(balanceDate + "T00:00:00").toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`
    : "Solde actuel";

  const kpis = [
    {
      label: "Transactions",
      value: filteredCount.toLocaleString("fr-FR"),
      color: "text-foreground",
      bg: "bg-muted/50",
    },
    {
      label: "Revenus",
      value: `+${formatCurrency(filteredIncome)}`,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      label: "Dépenses",
      value: formatCurrency(filteredExpenses),
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950/30",
    },
    {
      label: "Différence sur la période",
      value: `${filteredNet >= 0 ? "+" : ""}${formatCurrency(filteredNet)}`,
      color: filteredNet >= 0 ? "text-emerald-600" : "text-red-600",
      bg: filteredNet >= 0
        ? "bg-emerald-50 dark:bg-emerald-950/30"
        : "bg-red-50 dark:bg-red-950/30",
    },
    {
      label: balanceLabel,
      value:
        balanceAtDate != null
          ? `${balanceAtDate >= 0 ? "+" : ""}${formatCurrency(balanceAtDate)}`
          : "—",
      color:
        balanceAtDate != null
          ? balanceAtDate >= 0
            ? "text-emerald-600"
            : "text-red-600"
          : "text-muted-foreground",
      bg:
        balanceAtDate != null
          ? balanceAtDate >= 0
            ? "bg-emerald-50 dark:bg-emerald-950/30"
            : "bg-red-50 dark:bg-red-950/30"
          : "bg-muted/50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={`rounded-xl border p-3.5 ${kpi.bg}`}
        >
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {kpi.label}
          </p>
          <p className={`text-lg font-bold tracking-tight ${kpi.color}`}>
            {kpi.value}
          </p>
        </div>
      ))}
    </div>
  );
}
