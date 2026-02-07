import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { AccountModal } from "./AccountModal";
import { CalibrateModal } from "./CalibrateModal";
import { accountService } from "../../services/account.service";
import { formatCurrency } from "../../utils/format";
import type { Account } from "../../types/account.types";

const TYPE_LABELS: Record<string, string> = {
  courant: "Compte courant",
  epargne: "Epargne",
  carte: "Carte de credit",
  invest: "Investissement",
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [calibratingAccount, setCalibratingAccount] = useState<Account | null>(null);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await accountService.list();
      setAccounts(data);
    } catch {
      setError("Impossible de charger les comptes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCreate = () => {
    setEditingAccount(null);
    setModalOpen(true);
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setModalOpen(true);
  };

  const handleArchive = async (account: Account) => {
    if (!confirm(`Archiver le compte "${account.name}" ?`)) return;
    try {
      await accountService.archive(account.id);
      await fetchAccounts();
    } catch {
      setError("Impossible d'archiver le compte.");
    }
  };

  const handleModalClose = (refreshNeeded: boolean) => {
    setModalOpen(false);
    setEditingAccount(null);
    if (refreshNeeded) fetchAccounts();
  };

  const handleCalibrate = (account: Account) => {
    setCalibratingAccount(account);
  };

  const handleCalibrateClose = (refreshNeeded: boolean) => {
    setCalibratingAccount(null);
    if (refreshNeeded) fetchAccounts();
  };

  const totalBalance = accounts.reduce((sum, a) => sum + (a.current_balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Comptes bancaires</h1>
          <p className="text-muted-foreground mt-1">
            Gerez vos comptes et suivez vos soldes.
          </p>
        </div>
        <Button onClick={handleCreate} size="lg">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un compte
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Total balance */}
      {accounts.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Solde total</p>
                <p className={`text-3xl font-bold ${totalBalance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(totalBalance)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{accounts.length} compte(s) actif(s)</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <svg className="h-8 w-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
            <h3 className="text-lg font-semibold mb-1">Aucun compte</h3>
            <p className="text-muted-foreground mb-4">Ajoutez votre premier compte bancaire pour commencer.</p>
            <Button onClick={handleCreate}>Ajouter un compte</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: account.color || "#6366f1" }}
                    />
                    <CardTitle className="text-lg">{account.name}</CardTitle>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCalibrate(account)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                      title="Calibrer le solde"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleEdit(account)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                      title="Modifier"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleArchive(account)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Archiver"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${(account.current_balance ?? 0) >= 0 ? "text-foreground" : "text-red-600"}`}>
                  {formatCurrency(account.current_balance ?? 0, account.currency)}
                </p>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <span>{TYPE_LABELS[account.type] || account.type}</span>
                  {account.bank_name && (
                    <>
                      <span>·</span>
                      <span>{account.bank_name}</span>
                    </>
                  )}
                </div>
                {account.balance_reference_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Calibre le {new Date(account.balance_reference_date + "T00:00:00").toLocaleDateString("fr-FR")} a{" "}
                    {formatCurrency(account.balance_reference_amount ?? 0, account.currency)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <AccountModal account={editingAccount} onClose={handleModalClose} />
      )}

      {calibratingAccount && (
        <CalibrateModal account={calibratingAccount} onClose={handleCalibrateClose} />
      )}
    </div>
  );
}
