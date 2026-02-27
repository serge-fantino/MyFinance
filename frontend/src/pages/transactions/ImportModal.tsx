import { useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Input } from "../../components/ui/Input";
import { transactionService } from "../../services/transaction.service";
import type { Account } from "../../types/account.types";
import type { ImportPreviewResult, ImportResult, ImportRowResponse } from "../../types/transaction.types";

interface ImportModalProps {
  accounts: Account[];
  onClose: (refreshNeeded: boolean) => void;
}

type ImportStep = "form" | "confirm" | "preview" | "result";

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
  const [forcedRowIds, setForcedRowIds] = useState<Set<number>>(new Set());
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
      setForcedRowIds(new Set());
    }
  };

  const isOfxFile = file?.name ? /\.(ofx|qfx|xml)$/i.test(file.name) : false;
  const canProceedWithoutAccount = isOfxFile && accounts.length === 0;

  const handleNextOrPreview = async () => {
    if (!file) return;
    if (!canProceedWithoutAccount && !accountId) return;
    setError(null);
    setIsUploading(true);
    try {
      const previewResult = await transactionService.importPreview(
        file,
        accountId ? parseInt(accountId) : undefined,
      );
      setPreview(previewResult);

      const hasOfxInfo = previewResult.file_account_info || previewResult.file_balance_info;
      const canCreateFromOfx = canProceedWithoutAccount && !!previewResult.file_account_info;
      if (hasOfxInfo && (accounts.length > 0 || canCreateFromOfx)) {
        setStep("confirm");
        if (canProceedWithoutAccount) setAccountAction("create");
      } else {
        // Go directly to preview for non-OFX files
        setStep("preview");
      }
    } catch {
      setError("Erreur lors de la lecture du fichier.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmToPreview = () => {
    setStep("preview");
  };

  const toggleForceRow = (rowId: number) => {
    setForcedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const doConfirmImport = async () => {
    if (!preview) return;
    const targetAccountId = accountId ? parseInt(accountId) : 0;
    setError(null);
    setIsUploading(true);
    try {
      const importResult = await transactionService.importConfirm({
        import_log_id: preview.import_log_id,
        account_id: targetAccountId,
        forced_row_ids: Array.from(forcedRowIds),
        account_action: accountAction,
        new_account_name: accountAction === "create" ? newAccountName.trim() : undefined,
        apply_balance_reference: applyBalanceReference && !!preview.file_balance_info,
      });
      setResult(importResult);
      setStep("result");
    } catch {
      setError("Erreur lors de l'import.");
    } finally {
      setIsUploading(false);
    }
  };

  const fileAccountInfo = preview?.file_account_info;

  // Group rows by status for preview
  const importableRows = preview?.rows.filter(
    (r) => r.status === "imported" || forcedRowIds.has(r.id),
  ) || [];
  const duplicateRows = preview?.rows.filter(
    (r) => (r.status === "duplicate_exact" || r.status === "duplicate_fuzzy") && !forcedRowIds.has(r.id),
  ) || [];
  const errorRows = preview?.rows.filter((r) => r.status === "rejected") || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => onClose(!!result)} />

      <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-1">Importer des transactions</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {step === "preview"
              ? "Vérifiez les transactions avant de confirmer l'import."
              : "Importez un relevé bancaire au format OFX, CSV ou Excel."}
          </p>

          {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

          {step === "preview" && preview ? (
            /* ── Step: Preview rows ── */
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex gap-3 text-sm flex-wrap">
                <span className="px-2 py-1 rounded bg-muted">
                  {preview.total_rows} lignes
                </span>
                <span className="px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  {importableRows.length} à importer
                </span>
                {duplicateRows.length > 0 && (
                  <span className="px-2 py-1 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                    {duplicateRows.length} doublons
                  </span>
                )}
                {errorRows.length > 0 && (
                  <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    {errorRows.length} erreurs
                  </span>
                )}
              </div>

              {preview.file_already_imported && (
                <Alert variant="destructive">
                  Ce fichier a déjà été importé. Les transactions en doublon seront ignorées.
                </Alert>
              )}

              {/* Importable rows */}
              {importableRows.length > 0 && (
                <RowSection
                  title={`À importer (${importableRows.length})`}
                  color="emerald"
                  rows={importableRows}
                  defaultOpen={importableRows.length <= 20}
                />
              )}

              {/* Duplicate rows */}
              {duplicateRows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                    Doublons ({duplicateRows.length})
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-yellow-50 dark:bg-yellow-900/20">
                        <tr>
                          <th className="px-3 py-2 text-left w-8">Forcer</th>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Libellé</th>
                          <th className="px-3 py-2 text-right">Montant</th>
                          <th className="px-3 py-2 text-left">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {duplicateRows.map((row) => (
                          <DuplicateRow
                            key={row.id}
                            row={row}
                            forced={forcedRowIds.has(row.id)}
                            onToggle={() => toggleForceRow(row.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Error rows */}
              {errorRows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-700 dark:text-red-300">
                    Erreurs ({errorRows.length})
                  </h4>
                  <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                    {errorRows.map((row) => (
                      <div key={row.id} className="px-3 py-1 bg-red-50 dark:bg-red-900/20 rounded">
                        Ligne {row.row_index + 1}: {row.reject_reason || "Erreur inconnue"}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(fileAccountInfo ? "confirm" : "form")}
                >
                  Retour
                </Button>
                <Button
                  className="flex-1"
                  disabled={importableRows.length === 0}
                  isLoading={isUploading}
                  onClick={doConfirmImport}
                >
                  Confirmer l'import ({importableRows.length})
                </Button>
              </div>
            </div>
          ) : step === "confirm" && (fileAccountInfo || preview?.file_balance_info) ? (
            /* ── Step: OFX confirm ── */
            <div className="space-y-4">
              {fileAccountInfo && accountAction !== "create" && accounts.length > 0 && (
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
              {accounts.length === 0 && fileAccountInfo && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <p className="font-medium">Création de compte obligatoire</p>
                  <p className="text-muted-foreground mt-0.5">
                    Aucun compte existant. Un nouveau compte sera créé à partir des informations du fichier OFX.
                  </p>
                </div>
              )}
              {!fileAccountInfo && accounts.length > 0 && (
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
                <p className="text-sm font-medium">
                  {accounts.length === 0 ? "Créer un nouveau compte" : "Choisir une action :"}
                </p>
                <div className="space-y-2">
                  {accounts.length > 0 && (
                    <>
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
                    </>
                  )}
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
                  disabled={accountAction === "create" && !newAccountName.trim()}
                  isLoading={isUploading}
                  onClick={handleConfirmToPreview}
                >
                  Voir le détail
                </Button>
              </div>
            </div>
          ) : result ? (
            /* ── Step: Result ── */
            <div className="space-y-4">
              <Alert variant="success">Import terminé avec succès !</Alert>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{result.total_rows}</p>
                  <p className="text-xs text-muted-foreground">Lignes lues</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{result.imported_count}</p>
                  <p className="text-xs text-muted-foreground">Importées</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{result.duplicate_count}</p>
                  <p className="text-xs text-muted-foreground">Doublons ignorés</p>
                </div>
                {result.rules_applied != null && result.rules_applied > 0 ? (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{result.rules_applied}</p>
                    <p className="text-xs text-muted-foreground">Classifiées (règles)</p>
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
            /* ── Step: Form ── */
            <div className="space-y-4">
              {!canProceedWithoutAccount && (
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
              {canProceedWithoutAccount && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <p className="font-medium">Aucun compte existant</p>
                  <p className="text-muted-foreground mt-0.5">
                    Le fichier OFX permettra de créer un nouveau compte à partir des informations bancaires détectées.
                  </p>
                </div>
              )}

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
                <p className="mt-1">Les doublons sont détectés et vous pourrez les vérifier avant de confirmer l'import.</p>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => onClose(false)}>
                  Annuler
                </Button>
                <Button
                  className="flex-1"
                  disabled={!file || (!canProceedWithoutAccount && !accountId)}
                  isLoading={isUploading}
                  onClick={handleNextOrPreview}
                >
                  {isOfxFile ? "Suivant" : "Analyser"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function RowSection({
  title,
  color,
  rows,
  defaultOpen = true,
}: {
  title: string;
  color: string;
  rows: ImportRowResponse[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colorClasses: Record<string, string> = {
    emerald: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20",
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`text-sm font-medium flex items-center gap-2 ${colorClasses[color] || ""} px-2 py-1 rounded`}
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {title}
      </button>
      {open && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Libellé</th>
                <th className="px-3 py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-muted-foreground">{row.row_index + 1}</td>
                  <td className="px-3 py-1.5">{row.raw_data.date || "—"}</td>
                  <td className="px-3 py-1.5 truncate max-w-[250px]">{row.raw_data.label || "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.raw_data.amount || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DuplicateRow({
  row,
  forced,
  onToggle,
}: {
  row: ImportRowResponse;
  forced: boolean;
  onToggle: () => void;
}) {
  const matchType = row.status === "duplicate_exact" ? "Exact" : "Approché";
  return (
    <>
      <tr className={`hover:bg-muted/30 ${forced ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""}`}>
        <td className="px-3 py-1.5 text-center">
          <input
            type="checkbox"
            checked={forced}
            onChange={onToggle}
            className="rounded"
            title="Forcer l'import de cette ligne"
          />
        </td>
        <td className="px-3 py-1.5 text-muted-foreground">{row.row_index + 1}</td>
        <td className="px-3 py-1.5">{row.raw_data.date || "—"}</td>
        <td className="px-3 py-1.5 truncate max-w-[200px]">{row.raw_data.label || "—"}</td>
        <td className="px-3 py-1.5 text-right font-mono">{row.raw_data.amount || "—"}</td>
        <td className="px-3 py-1.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            row.status === "duplicate_exact"
              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
              : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
          }`}>
            {matchType}
          </span>
        </td>
      </tr>
      {row.duplicate_of_summary && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-8 py-1 text-[10px] text-muted-foreground">
            Doublon de : "{row.duplicate_of_summary.label}" du {row.duplicate_of_summary.date} ({row.duplicate_of_summary.amount} €)
          </td>
        </tr>
      )}
    </>
  );
}
