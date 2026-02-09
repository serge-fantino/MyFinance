import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { transactionService } from "../../services/transaction.service";
import { formatCurrency, formatDate } from "../../utils/format";
import type { TransactionCluster, ClustersResponse } from "../../types/transaction.types";

interface ClusterReviewModalProps {
  clusters: ClustersResponse;
  flatCategories: { id: number; name: string; parentName: string | null; depth: number }[];
  onClose: (refreshNeeded: boolean) => void;
  onCategoryDropdownOpen?: () => void;
}

type ClusterStatus = "pending" | "accepted" | "skipped";

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  low: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const SOURCE_LABELS: Record<string, string> = {
  similar_transactions: "Similarite avec transactions classees",
  category_semantics: "Semantique de la categorie",
};

export function ClusterReviewModal({
  clusters,
  flatCategories,
  onClose,
  onCategoryDropdownOpen,
}: ClusterReviewModalProps) {
  const [statuses, setStatuses] = useState<Record<number, ClusterStatus>>({});
  const [overrides, setOverrides] = useState<Record<number, number | null>>({});
  const [rulePatterns, setRulePatterns] = useState<Record<number, string>>({});
  const [customLabels, setCustomLabels] = useState<Record<number, string>>({});
  const [processing, setProcessing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anyApplied, setAnyApplied] = useState(false);
  const [sortBy, setSortBy] = useState<"amount" | "count">("amount");
  const [excludedIds, setExcludedIds] = useState<Record<number, Set<number>>>({});

  const acceptedCount = Object.values(statuses).filter((s) => s === "accepted").length;
  const totalClusters = clusters.clusters.length;

  const sortedClusters = [...clusters.clusters].sort((a, b) =>
    sortBy === "amount"
      ? b.total_amount_abs - a.total_amount_abs
      : b.transaction_count - a.transaction_count
  );

  const handleAccept = async (cluster: TransactionCluster) => {
    const categoryId = overrides[cluster.cluster_id] ?? cluster.suggested_category_id;
    if (!categoryId) return;

    const excluded = excludedIds[cluster.cluster_id];
    const idsToClassify = excluded
      ? cluster.transaction_ids.filter((id) => !excluded.has(id))
      : cluster.transaction_ids;
    if (idsToClassify.length === 0) return;

    setProcessing(cluster.cluster_id);
    setError(null);
    try {
      await transactionService.classifyCluster({
        transaction_ids: idsToClassify,
        category_id: categoryId,
        create_rule: true,
        rule_pattern: rulePatterns[cluster.cluster_id] || undefined,
        custom_label: customLabels[cluster.cluster_id] || undefined,
      });
      setStatuses((prev) => ({ ...prev, [cluster.cluster_id]: "accepted" }));
      setAnyApplied(true);
    } catch {
      setError(`Erreur lors de la classification du cluster "${cluster.representative_label}".`);
    } finally {
      setProcessing(null);
    }
  };

  const handleSkip = (clusterId: number) => {
    setStatuses((prev) => ({ ...prev, [clusterId]: "skipped" }));
  };

  const handleOverrideCategory = (clusterId: number, categoryId: number | null) => {
    setOverrides((prev) => ({ ...prev, [clusterId]: categoryId }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => onClose(anyApplied)} />

      <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b shrink-0">
          <h2 className="text-xl font-semibold">Suggestions de classification</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalClusters === 0
              ? "Aucun regroupement trouve."
              : `${totalClusters} groupe${totalClusters > 1 ? "s" : ""} de transactions similaires detecte${totalClusters > 1 ? "s" : ""}.`}
            {clusters.unclustered_count > 0 && (
              <span> {clusters.unclustered_count} transaction{clusters.unclustered_count > 1 ? "s" : ""} isolee{clusters.unclustered_count > 1 ? "s" : ""}.</span>
            )}
          </p>
          {totalClusters > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Trier par :</span>
              <button
                type="button"
                onClick={() => setSortBy("amount")}
                className={`text-xs px-2 py-1 rounded ${sortBy === "amount" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              >
                Montant total
              </button>
              <button
                type="button"
                onClick={() => setSortBy("count")}
                className={`text-xs px-2 py-1 rounded ${sortBy === "count" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              >
                Nombre de transactions
              </button>
            </div>
          )}
          {acceptedCount > 0 && (
            <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              {acceptedCount} / {totalClusters} groupe{acceptedCount > 1 ? "s" : ""} classifie{acceptedCount > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          {totalClusters === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <svg className="mx-auto h-12 w-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>Toutes les transactions sont classees ou il n'y a pas assez de donnees pour former des groupes.</p>
            </div>
          )}

          {sortedClusters.map((cluster) => {
            const status = statuses[cluster.cluster_id];
            if (status === "accepted" || status === "skipped") {
              return (
                <div
                  key={cluster.cluster_id}
                  className={`rounded-lg border p-4 opacity-50 ${
                    status === "accepted" ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800" : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{cluster.representative_label}</span>
                    <span className={`text-xs ${status === "accepted" ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {status === "accepted" ? "Classifie" : "Ignore"}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <ClusterCard
                key={cluster.cluster_id}
                cluster={cluster}
                flatCategories={flatCategories}
                overrideCategory={overrides[cluster.cluster_id] ?? null}
                rulePattern={rulePatterns[cluster.cluster_id] ?? ""}
                customLabel={customLabels[cluster.cluster_id] ?? ""}
                excludedIds={excludedIds[cluster.cluster_id]}
                isProcessing={processing === cluster.cluster_id}
                onAccept={() => handleAccept(cluster)}
                onSkip={() => handleSkip(cluster.cluster_id)}
                onOverrideCategory={(catId) => handleOverrideCategory(cluster.cluster_id, catId)}
                onRulePatternChange={(v) => setRulePatterns((p) => ({ ...p, [cluster.cluster_id]: v }))}
                onCustomLabelChange={(v) => setCustomLabels((p) => ({ ...p, [cluster.cluster_id]: v }))}
                onToggleExclude={(txnId) => {
                  setExcludedIds((prev) => {
                    const set = new Set(prev[cluster.cluster_id] ?? []);
                    if (set.has(txnId)) set.delete(txnId);
                    else set.add(txnId);
                    return { ...prev, [cluster.cluster_id]: set };
                  });
                }}
                onCategoryDropdownOpen={onCategoryDropdownOpen}
              />
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t shrink-0 flex justify-between items-center">
          <div className="text-xs text-muted-foreground">
            {clusters.total_uncategorized} transaction{clusters.total_uncategorized !== 1 ? "s" : ""} non classee{clusters.total_uncategorized !== 1 ? "s" : ""} au total
          </div>
          <Button variant="outline" onClick={() => onClose(anyApplied)}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Individual cluster card ─────────────────────────────

function ClusterCard({
  cluster,
  flatCategories,
  overrideCategory,
  rulePattern,
  customLabel,
  excludedIds,
  isProcessing,
  onAccept,
  onSkip,
  onOverrideCategory,
  onRulePatternChange,
  onCustomLabelChange,
  onToggleExclude,
  onCategoryDropdownOpen,
}: {
  cluster: TransactionCluster;
  flatCategories: { id: number; name: string; parentName: string | null; depth: number }[];
  overrideCategory: number | null;
  rulePattern: string;
  customLabel: string;
  excludedIds: Set<number> | undefined;
  isProcessing: boolean;
  onAccept: () => void;
  onSkip: () => void;
  onOverrideCategory: (catId: number | null) => void;
  onRulePatternChange: (v: string) => void;
  onCustomLabelChange: (v: string) => void;
  onToggleExclude: (txnId: number) => void;
  onCategoryDropdownOpen?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const excludedCount = excludedIds?.size ?? 0;
  const includedCount = cluster.transaction_count - excludedCount;

  const effectiveCategoryId = overrideCategory ?? cluster.suggested_category_id;
  const effectiveCategoryName =
    overrideCategory != null
      ? flatCategories.find((c) => c.id === overrideCategory)?.name ?? "?"
      : cluster.suggested_category_name;
  const confidence = cluster.suggestion_confidence;
  const hasSuggestion = effectiveCategoryId != null;

  const transactions = cluster.transactions ?? cluster.sample_transactions;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{cluster.representative_label}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {cluster.transaction_count} transaction{cluster.transaction_count > 1 ? "s" : ""}
              {cluster.total_amount_abs != null && (
                <> · {formatCurrency(cluster.total_amount_abs)}</>
              )}
            </span>
          </div>
          {/* Suggestion badge */}
          {cluster.suggested_category_name && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs text-muted-foreground">Suggestion :</span>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                {cluster.suggested_category_name}
              </span>
              {confidence && (
                <span className={`inline-flex items-center rounded px-1.5 py-0 text-[10px] font-medium ${CONFIDENCE_COLORS[confidence] || ""}`}>
                  {confidence}
                </span>
              )}
              {cluster.suggestion_source && (
                <span className="text-[10px] text-muted-foreground">
                  ({SOURCE_LABELS[cluster.suggestion_source] || cluster.suggestion_source})
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
        >
          {expanded ? "Masquer" : "Details"}
        </button>
      </div>

      {/* Expanded details: full transaction list with include/exclude */}
      {expanded && (
        <div className="bg-muted/30 rounded-md p-2 space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium mb-1">
            Liste des transactions ({transactions.length}) — décocher pour exclure de la classification
          </p>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {transactions.map((txn) => {
              const excluded = excludedIds?.has(txn.id) ?? false;
              return (
                <label
                  key={txn.id}
                  className={`flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 -mx-1 ${excluded ? "opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={!excluded}
                    onChange={() => onToggleExclude(txn.id)}
                    className="rounded border-input shrink-0"
                  />
                  <span className="text-muted-foreground shrink-0 w-16">{formatDate(txn.date)}</span>
                  <span className="truncate flex-1 min-w-0">{txn.label_raw}</span>
                  <span className={`shrink-0 font-medium ${txn.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {txn.amount >= 0 ? "+" : ""}{formatCurrency(txn.amount)}
                  </span>
                </label>
              );
            })}
          </div>
          {excludedCount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {excludedCount} transaction{excludedCount > 1 ? "s" : ""} exclue{excludedCount > 1 ? "s" : ""} — {includedCount} seront classifiée{includedCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* Category override + rule pattern */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Categorie</label>
          <select
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
            value={effectiveCategoryId ?? ""}
            onChange={(e) => onOverrideCategory(e.target.value ? parseInt(e.target.value) : null)}
            onFocus={() => onCategoryDropdownOpen?.()}
          >
            <option value="">-- Choisir --</option>
            {flatCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.depth > 0 ? "\u00A0\u00A0".repeat(cat.depth) : ""}
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Motif regle (optionnel)</label>
          <input
            type="text"
            placeholder={cluster.representative_label}
            value={rulePattern}
            onChange={(e) => onRulePatternChange(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
          />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[10px] text-muted-foreground font-medium">Libelle personnalise (optionnel)</label>
          <input
            type="text"
            placeholder="Ex: Amazon"
            value={customLabel}
            onChange={(e) => onCustomLabelChange(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          disabled={!hasSuggestion || isProcessing || includedCount === 0}
          isLoading={isProcessing}
          onClick={onAccept}
          className="flex-1"
        >
          Appliquer{effectiveCategoryName ? ` "${effectiveCategoryName}"` : ""}
          {includedCount > 0 && includedCount < cluster.transaction_count && ` (${includedCount})`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isProcessing}
          onClick={onSkip}
        >
          Ignorer
        </Button>
      </div>
    </div>
  );
}
