import { useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Input } from "../../components/ui/Input";
import { transactionService } from "../../services/transaction.service";
import type { Account } from "../../types/account.types";
import type { ImportPreviewResult, ImportResult } from "../../types/transaction.types";

interface ImportModalProps {
  accounts: Account[];
  onClose: (refreshNeeded: boolean) => void;
}

type ImportStep = "form" | "confirm" | "result";

export function ImportModal({ accounts, onClose }: ImportModalProps) {
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id.toString() || "");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<ImportStep>("form");
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [accountAction, setAccountAction] = useState<"use" | "update" | "create">("use");
  const [newAccountName, setNewAccountName] = useState("");
  const [applyBalanceReference, setApplyBalanceReference] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (!["csv", "xlsx", "xls", "ofx", "qfx", "xml"].includes(ext || "")) {
        setError("Format non supporté. Utilisez .csv, .xlsx, .ofx, .qfx ou .xml");
        return;
      }
      setError(null);
      setFile(f);
      setStep("form");
      setPreview(null);
    }
  };

  const handleNextOrImport = async () => {
    if (!file || !accountId) return;
    setError(null);
    setIsUploading(true);
    try {
      const previewResult = await transactionService.importPreview(file);
      setPreview(previewResult);

      if ((previewResult.file_account_info || previewResult.file_balance_info) && accounts.length > 0) {
        setStep("confirm");
      } else {
        await doImport(parseInt(accountId), "use", undefined);
      }
    } catch {
      setError("Erreur lors de la lecture du fichier.");
    } finally {
      setIsUploading(false);
    }
  };

  const doImport = async (
    targetAccountId: number,
    action: "use" | "update" | "create",
    name?: string,
    useBalanceRef?: boolean
  ) => {
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const importResult = await transactionService.import(
        targetAccountId,
        file,
        action,
        name,
        useBalanceRef
      );
      setResult(importResult);
      setStep("result");
    } catch {
      setError("Erreur lors de l'import. Vérifiez le format du fichier.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = () => {
    const useBalanceRef = applyBalanceReference && !!preview?.file_balance_info;
    if (accountAction === "create" && newAccountName.trim()) {
      doImport(parseInt(accountId), "create", newAccountName.trim(), useBalanceRef);
    } else if (accountAction === "create") {
      setError("Indiquez un nom pour le nouveau compte.");
    } else {
      doImport(parseInt(accountId), accountAction, undefined, useBalanceRef);
    }
  };

  const fileAccountInfo = preview?.file_account_info;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => onClose(!!result)} />

      <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-1">Importer des transactions</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Importez un relevé bancaire au format OFX, CSV ou Excel.
          </p>

          {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

          {step === "confirm" && (fileAccountInfo || preview?.file_balance_info) ? (
            /* Confirmation OFX : compte et/ou solde détectés */
            <div className="space-y-4">
              {fileAccountInfo && accountAction !== "create" && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">Compte cible</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {!fileAccountInfo && (
                <>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium">Compte cible</label>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {preview?.total_rows} transaction{preview && preview.total_rows !== 1 ? "s" : ""} dans le fichier
                  </p>
                </>
              )}
              {fileAccountInfo && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium mb-2">Compte détecté dans le fichier OFX :</p>
                <dl className="space-y-1 text-muted-foreground">
                  {fileAccountInfo.bank_id && (
                    <div className="flex gap-2">
                      <dt className="w-24">Banque :</dt>
                      <dd>{fileAccountInfo.bank_id}</dd>
                    </div>
                  )}
                  {fileAccountInfo.branch_id && (
                    <div className="flex gap-2">
                      <dt className="w-24">Guichet :</dt>
                      <dd>{fileAccountInfo.branch_id}</dd>
                    </div>
                  )}
                  {fileAccountInfo.acct_id && (
                    <div className="flex gap-2">
                      <dt className="w-24">Compte :</dt>
                      <dd>{fileAccountInfo.acct_id}</dd>
                    </div>
                  )}
                  {fileAccountInfo.acct_type && (
                    <div className="flex gap-2">
                      <dt className="w-24">Type :</dt>
                      <dd>{fileAccountInfo.acct_type}</dd>
                    </div>
                  )}
                  {fileAccountInfo.institution && (
                    <div className="flex gap-2">
                      <dt className="w-24">Établissement :</dt>
                      <dd>{fileAccountInfo.institution}</dd>
                    </div>
                  )}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  {preview?.total_rows} transaction{preview && preview.total_rows !== 1 ? "s" : ""} dans le fichier
                </p>
              </div>
              )}

              {preview?.file_balance_info && (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  <p className="font-medium mb-2">Solde dans le fichier :</p>
                  <p className="text-muted-foreground">
                    {preview.file_balance_info.amount.toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    € au {new Date(preview.file_balance_info.date).toLocaleDateString("fr-FR")}
                  </p>
                  <label className="mt-3 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyBalanceReference}
                      onChange={(e) => setApplyBalanceReference(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">
                      Utiliser ce solde comme point de référence (calibration du compte)
                    </span>
                  </label>
                </div>
              )}

              {fileAccountInfo && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Choisir une action :</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer rounded border p-3 hover:bg-muted/30">
                    <input
                      type="radio"
                      name="account_action"
                      checked={accountAction === "use"}
                      onChange={() => setAccountAction("use")}
                      className="rounded-full"
                    />
                    <span>Importer dans le compte sélectionné</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer rounded border p-3 hover:bg-muted/30">
                    <input
                      type="radio"
                      name="account_action"
                      checked={accountAction === "update"}
                      onChange={() => setAccountAction("update")}
                      className="rounded-full"
                    />
                    <span>Importer et mettre à jour les infos du compte</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer rounded border p-3 hover:bg-muted/30">
                    <input
                      type="radio"
                      name="account_action"
                      checked={accountAction === "create"}
                      onChange={() => setAccountAction("create")}
                      className="rounded-full"
                    />
                    <span>Créer un nouveau compte</span>
                  </label>
                </div>
                {accountAction === "create" && (
                  <div className="mt-2">
                    <label className="block text-sm font-medium mb-1">Nom du nouveau compte</label>
                    <Input
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="Ex: Compte courant BNP"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep("form")}
                >
                  Retour
                </Button>
                <Button
                  className="flex-1"
                  disabled={fileAccountInfo && accountAction === "create" && !newAccountName.trim()}
                  isLoading={isUploading}
                  onClick={handleConfirmImport}
                >
                  Confirmer et importer
                </Button>
              </div>
            </div>
          ) : result ? (
            /* Import result */
            <div className="space-y-4">
              <Alert variant="success">Import termine avec succes !</Alert>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{result.total_rows}</p>
                  <p className="text-xs text-muted-foreground">Lignes lues</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{result.imported_count}</p>
                  <p className="text-xs text-muted-foreground">Importees</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{result.duplicate_count}</p>
                  <p className="text-xs text-muted-foreground">Doublons ignores</p>
                </div>
                {result.rules_applied != null && result.rules_applied > 0 ? (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{result.rules_applied}</p>
                    <p className="text-xs text-muted-foreground">Classifiees (regles)</p>
                  </div>
                ) : (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{result.error_count}</p>
                    <p className="text-xs text-muted-foreground">Erreurs</p>
                  </div>
                )}
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium mb-1">Erreurs :</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              <Button className="w-full" onClick={() => onClose(true)}>Fermer</Button>
            </div>
          ) : (
            /* Import form */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium">Compte cible</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.ofx,.qfx,.xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {file ? (
                  <div>
                    <svg className="mx-auto h-8 w-8 text-emerald-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} Ko</p>
                  </div>
                ) : (
                  <div>
                    <svg className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="font-medium">Cliquez pour choisir un fichier</p>
                    <p className="text-xs text-muted-foreground mt-1">OFX, QFX, CSV ou Excel (.xlsx)</p>
                  </div>
                )}
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Formats supportés :</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li><strong>OFX / QFX</strong> — Format standard des banques (recommandé). Détection automatique.</li>
                  <li><strong>CSV / Excel</strong> — Colonnes attendues : <strong>date</strong>, <strong>montant</strong> (ou amount), <strong>libellé</strong> (ou label/description).</li>
                </ul>
                <p className="mt-1">Les doublons sont automatiquement détectés et ignorés.</p>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => onClose(false)}>
                  Annuler
                </Button>
                <Button
                  className="flex-1"
                  disabled={!file || !accountId}
                  isLoading={isUploading}
                  onClick={handleNextOrImport}
                >
                  {file?.name && /\.(ofx|qfx|xml)$/i.test(file.name) ? "Suivant" : "Importer"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
