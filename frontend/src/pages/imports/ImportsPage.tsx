import { useState, useEffect, useCallback } from "react";
import { transactionService } from "../../services/transaction.service";
import type { ImportLogSummary, ImportDetailResponse, ImportRowResponse } from "../../types/transaction.types";

const statusLabels: Record<string, { label: string; color: string }> = {
  done: { label: "Terminé", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  previewing: { label: "En attente", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  confirmed: { label: "En cours", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  cancelled: { label: "Annulé", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
  error: { label: "Erreur", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

export default function ImportsPage() {
  const [imports, setImports] = useState<ImportLogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedImport, setSelectedImport] = useState<ImportDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchImports = useCallback(async () => {
    setLoading(true);
    try {
      const result = await transactionService.getImportHistory(page, 20);
      setImports(result.data);
      setTotalPages(result.meta.pages);
    } catch {
      setImports([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  const openDetail = async (importId: number) => {
    setDetailLoading(true);
    try {
      const detail = await transactionService.getImportDetail(importId);
      setSelectedImport(detail);
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} o`;
    return `${(bytes / 1024).toFixed(1)} Ko`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historique des imports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consultez vos imports passés et leurs détails.
        </p>
      </div>

      {selectedImport ? (
        /* ── Detail view ── */
        <ImportDetailView
          detail={selectedImport}
          onBack={() => setSelectedImport(null)}
        />
      ) : (
        /* ── List view ── */
        <>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Chargement...</div>
          ) : imports.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Aucun import pour le moment.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Importez des transactions depuis la page Transactions.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Fichier</th>
                    <th className="px-4 py-3 text-left">Format</th>
                    <th className="px-4 py-3 text-right">Taille</th>
                    <th className="px-4 py-3 text-right">Lignes</th>
                    <th className="px-4 py-3 text-right">Importées</th>
                    <th className="px-4 py-3 text-right">Doublons</th>
                    <th className="px-4 py-3 text-left">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {imports.map((imp) => {
                    const st = statusLabels[imp.status] || { label: imp.status, color: "bg-muted" };
                    return (
                      <tr key={imp.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(imp.id)}>
                        <td className="px-4 py-3 text-muted-foreground">
                          {imp.created_at ? new Date(imp.created_at).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="px-4 py-3 font-medium truncate max-w-[200px]">{imp.filename}</td>
                        <td className="px-4 py-3 uppercase text-xs">{imp.format}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatSize(imp.file_size)}</td>
                        <td className="px-4 py-3 text-right">{imp.total_rows ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{imp.imported_count ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-yellow-600">{imp.duplicate_count ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              >
                Précédent
              </button>
              <span className="px-3 py-1 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          )}

          {detailLoading && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
              <div className="bg-card rounded-lg p-6 shadow-xl">Chargement du détail...</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Import Detail View ──────────────────────────────────────

function ImportDetailView({
  detail,
  onBack,
}: {
  detail: ImportDetailResponse;
  onBack: () => void;
}) {
  const log = detail.import_log;

  const importedRows = detail.rows.filter((r) => r.status === "imported" || r.status === "forced");
  const duplicateRows = detail.rows.filter((r) => r.status === "duplicate_exact" || r.status === "duplicate_fuzzy");
  const errorRows = detail.rows.filter((r) => r.status === "rejected");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-semibold">{log.filename}</h2>
          <p className="text-sm text-muted-foreground">
            Importé le {log.created_at ? new Date(log.created_at).toLocaleString("fr-FR") : "—"} — {log.format.toUpperCase()}
            {log.file_size ? ` — ${(log.file_size / 1024).toFixed(1)} Ko` : ""}
          </p>
        </div>
        {detail.file_downloadable && (
          <a
            href={transactionService.getImportFileUrl(log.id)}
            className="ml-auto px-3 py-1.5 rounded border text-sm hover:bg-muted transition-colors"
            download
          >
            Télécharger le fichier
          </a>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted rounded-lg p-3 text-center">
          <p className="text-xl font-bold">{log.total_rows ?? 0}</p>
          <p className="text-xs text-muted-foreground">Lignes</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{log.imported_count ?? 0}</p>
          <p className="text-xs text-muted-foreground">Importées</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-yellow-600">{log.duplicate_count ?? 0}</p>
          <p className="text-xs text-muted-foreground">Doublons</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-600">{log.error_count ?? 0}</p>
          <p className="text-xs text-muted-foreground">Erreurs</p>
        </div>
      </div>

      {/* Imported rows */}
      {importedRows.length > 0 && (
        <DetailSection title={`Transactions importées (${importedRows.length})`} color="emerald" rows={importedRows} />
      )}

      {/* Duplicate rows */}
      {duplicateRows.length > 0 && (
        <DetailSection title={`Doublons (${duplicateRows.length})`} color="yellow" rows={duplicateRows} showDuplicate />
      )}

      {/* Error rows */}
      {errorRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-red-700 dark:text-red-300">
            Erreurs ({errorRows.length})
          </h3>
          <div className="text-xs space-y-1 max-h-48 overflow-y-auto">
            {errorRows.map((row) => (
              <div key={row.id} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded">
                Ligne {row.row_index + 1}: {row.reject_reason || "Erreur inconnue"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailSection({
  title,
  color,
  rows,
  showDuplicate = false,
}: {
  title: string;
  color: string;
  rows: ImportRowResponse[];
  showDuplicate?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const headerColors: Record<string, string> = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    yellow: "text-yellow-700 dark:text-yellow-300",
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`text-sm font-medium flex items-center gap-2 ${headerColors[color] || ""}`}
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
        <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Libellé</th>
                <th className="px-3 py-2 text-right">Montant</th>
                {showDuplicate && <th className="px-3 py-2 text-left">Type</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-muted-foreground">{row.row_index + 1}</td>
                  <td className="px-3 py-1.5">{row.raw_data.date || "—"}</td>
                  <td className="px-3 py-1.5 truncate max-w-[250px]">{row.raw_data.label || "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{row.raw_data.amount || "—"}</td>
                  {showDuplicate && (
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        row.status === "duplicate_exact"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                          : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                      }`}>
                        {row.status === "duplicate_exact" ? "Exact" : "Approché"}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
