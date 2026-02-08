import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { accountService } from "../../services/account.service";
import { transactionService } from "../../services/transaction.service";
import { formatCurrency } from "../../utils/format";
import type { AccountSummary } from "../../types/account.types";
import type { CashflowMonthly } from "../../types/transaction.types";

export default function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [cashflowMonthly, setCashflowMonthly] = useState<CashflowMonthly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [summaryRes, cashflowRes] = await Promise.all([
          accountService.getSummary(),
          transactionService.getCashflowMonthly(),
        ]);
        if (!cancelled) {
          setSummary(summaryRes);
          setCashflowMonthly(cashflowRes);
        }
      } catch {
        if (!cancelled) {
          setSummary(null);
          setCashflowMonthly([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const currentMonthKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, []);

  const currentMonthCashflow = useMemo(
    () => cashflowMonthly.find((c) => c.month === currentMonthKey),
    [cashflowMonthly, currentMonthKey]
  );

  const totalBalance = summary?.total_balance ?? 0;
  const accountCount = summary?.total_accounts ?? 0;
  const monthIncome = currentMonthCashflow?.income ?? 0;
  const monthExpenses = currentMonthCashflow?.expenses ?? 0;

  const monthLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Bonjour, {user?.full_name?.split(" ")[0]} !
        </h1>
        <p className="text-muted-foreground mt-1">
          Voici un aperçu de vos finances.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solde total</CardTitle>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-24 rounded bg-muted animate-pulse" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${totalBalance >= 0 ? "text-foreground" : "text-red-600"}`}>
                  {formatCurrency(totalBalance)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {accountCount === 0 ? "Aucun compte configuré" : `${accountCount} compte(s) actif(s)`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenus du mois</CardTitle>
            <svg className="h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-24 rounded bg-muted animate-pulse" />
            ) : (
              <>
                <div className="text-2xl font-bold text-emerald-600">
                  +{formatCurrency(monthIncome)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {monthLabel}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dépenses du mois</CardTitle>
            <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
            </svg>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-24 rounded bg-muted animate-pulse" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">
                  -{formatCurrency(monthExpenses)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {monthLabel}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comptes</CardTitle>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-12 rounded bg-muted animate-pulse" />
            ) : (
              <>
                <div className="text-2xl font-bold">{accountCount}</div>
                <p className="text-xs text-muted-foreground">
                  {accountCount === 0 ? "Ajoutez votre premier compte" : "compte(s) actif(s)"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Getting started guide (only when no data) */}
      {!loading && accountCount === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pour commencer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  1
                </div>
                <div>
                  <p className="font-medium">Ajoutez un compte bancaire</p>
                  <p className="text-sm text-muted-foreground">
                    Rendez-vous dans la section &quot;Comptes&quot; pour ajouter votre premier compte.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  2
                </div>
                <div>
                  <p className="font-medium">Importez vos transactions</p>
                  <p className="text-sm text-muted-foreground">
                    Exportez un relevé CSV ou Excel depuis votre banque et importez-le.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  3
                </div>
                <div>
                  <p className="font-medium">Laissez l&apos;IA travailler</p>
                  <p className="text-sm text-muted-foreground">
                    Les transactions sont automatiquement classifiées. Vos tableaux de bord se remplissent.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
