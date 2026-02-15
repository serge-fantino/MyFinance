import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { classificationService } from "../../services/classification.service";
import { transactionService } from "../../services/transaction.service";
import { accountService } from "../../services/account.service";
import { categoryService } from "../../services/category.service";
import { formatCurrency, formatDate } from "../../utils/format";
import type {
  ClassificationProposalResponse,
  ClassificationClusterResponse,
  ReclusterDebug,
} from "../../types/classification.types";
import type { InterpretClusterResult } from "../../types/transaction.types";
import type { Account } from "../../types/account.types";
import type { Category } from "../../types/category.types";

const CLUSTER_SENSITIVITY_OPTIONS = [
  { value: 0.1, label: "Super exigeant" },
  { value: 0.14, label: "Très exigeant" },
  { value: 0.18, label: "Exigeant" },
  { value: 0.22, label: "Très sélectif" },
  { value: 0.28, label: "Sélectif" },
  { value: 0.36, label: "Normal" },
  { value: 0.48, label: "Large" },
] as const;

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  low: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const CLASSIFICATION_ACCOUNT_KEY = "classification_last_account_id";

export default function ClassificationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [clusterDistanceThreshold, setClusterDistanceThreshold] = useState(0.22);
  const [loading, setLoading] = useState(false);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ClassificationProposalResponse | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"amount" | "count">("amount");
  const [acceptedSectionExpanded, setAcceptedSectionExpanded] = useState(true);
  const [interpretResults, setInterpretResults] = useState<
    Record<number, InterpretClusterResult | "loading">
  >({});
  const [llmUiEnabled, setLlmUiEnabled] = useState(false);
  const patchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<Map<number, Record<string, unknown>>>(new Map());

  const fetchCategories = useCallback(() => {
    categoryService.list().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    accountService
      .list()
      .then((list) => {
        setAccounts(list);
        if (list.length > 0) {
          setAccountId((prev) => {
            const stored = localStorage.getItem(CLASSIFICATION_ACCOUNT_KEY);
            const storedId = stored ? parseInt(stored, 10) : NaN;
            const found = list.some((a) => a.id === storedId);
            if (found) return String(storedId);
            if (prev && list.some((a) => a.id === parseInt(prev, 10))) return prev;
            return String(list[0].id);
          });
        }
      })
      .catch(() => {});
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (accountId) {
      try {
        localStorage.setItem(CLASSIFICATION_ACCOUNT_KEY, accountId);
      } catch {
        /* ignore */
      }
    }
  }, [accountId]);

  useEffect(() => {
    transactionService
      .getLlmStatus()
      .then((r) => setLlmUiEnabled(r.ui_enabled))
      .catch(() => setLlmUiEnabled(false));
  }, []);

  // Load proposal when account changes
  const loadProposal = useCallback(async () => {
    const aid = accountId ? parseInt(accountId) : null;
    if (!aid) {
      setProposal(null);
      return;
    }
    setLoadingProposal(true);
    setError(null);
    try {
      const data = await classificationService.getProposal(aid);
      setProposal(data ?? null);
    } catch {
      setError("Impossible de charger la proposition.");
      setProposal(null);
    } finally {
      setLoadingProposal(false);
    }
  }, [accountId]);

  useEffect(() => {
    loadProposal();
  }, [loadProposal]);

  const flatCategories = useMemo(() => {
    const flat: { id: number; name: string; parentName: string | null; depth: number }[] = [];
    const walk = (cats: Category[], depth: number) => {
      for (const cat of cats) {
        const parentName = depth === 0 ? null : cat.name;
        flat.push({ id: cat.id, name: cat.name, parentName, depth });
        if (cat.children?.length) walk(cat.children, depth + 1);
      }
    };
    walk(categories, 0);
    return flat;
  }, [categories]);

  const patchCluster = useCallback(
    (clusterId: number, updates: Record<string, unknown>) => {
      // Merge with pending so we never overwrite a field changed by a concurrent update
      const merged = { ...pendingPatchRef.current.get(clusterId), ...updates };
      pendingPatchRef.current.set(clusterId, merged);
      // Optimistic update: apply merged state so category + custom_label stay independent
      setProposal((prev) =>
        prev
          ? {
              ...prev,
              clusters: prev.clusters.map((c) =>
                c.cluster_id === clusterId ? { ...c, ...merged } : c
              ),
            }
          : null
      );
      if (patchDebounceRef.current) clearTimeout(patchDebounceRef.current);
      patchDebounceRef.current = setTimeout(async () => {
        const aid = accountId ? parseInt(accountId) : 0;
        if (!aid || !proposal) return;
        const clusterUpdates = Array.from(pendingPatchRef.current.entries()).map(([cid, u]) => ({
          cluster_id: cid,
          ...u,
        }));
        pendingPatchRef.current.clear();
        try {
          const updated = await classificationService.patchProposal(aid, clusterUpdates);
          if (updated) setProposal(updated);
        } catch {
          setError("Erreur lors de la mise à jour.");
        }
      }, 400);
    },
    [accountId, proposal]
  );

  const handleAnalyze = useCallback(async () => {
    const aid = accountId ? parseInt(accountId) : null;
    if (!aid) {
      setError("Sélectionnez un compte.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await classificationService.recalculate(aid, clusterDistanceThreshold);
      if (result.total_uncategorized === 0) {
        setError("Toutes les transactions sont déjà classées.");
      } else {
        setProposal(result);
      }
    } catch {
      setError("Erreur lors du calcul des suggestions.");
    } finally {
      setLoading(false);
    }
  }, [accountId, clusterDistanceThreshold]);

  const handleAccept = async (cluster: ClassificationClusterResponse) => {
    const categoryId =
      cluster.override_category_id ??
      cluster.suggested_category_id ??
      interpretResults[cluster.cluster_id]?.suggestion?.category_id;
    if (!categoryId) return;

    const excluded = new Set(cluster.excluded_ids ?? []);
    const idsToClassify = cluster.transaction_ids.filter((id) => !excluded.has(id));
    if (idsToClassify.length === 0) return;

    setProcessing(cluster.cluster_id);
    setError(null);
    try {
      // Flush any pending patch before apply so backend has latest state
      if (patchDebounceRef.current) {
        clearTimeout(patchDebounceRef.current);
        patchDebounceRef.current = null;
        const aid = accountId ? parseInt(accountId) : 0;
        if (aid && proposal) {
          const clusterUpdates = Array.from(pendingPatchRef.current.entries()).map(([cid, u]) => ({
            cluster_id: cid,
            ...u,
          }));
          pendingPatchRef.current.clear();
          if (clusterUpdates.length > 0) {
            const updated = await classificationService.patchProposal(aid, clusterUpdates);
            if (updated) setProposal(updated);
          }
        }
      }

      await classificationService.applyCluster(cluster.cluster_id, {
        transaction_ids: idsToClassify,
        category_id: categoryId,
        create_rule: true,
        rule_pattern: cluster.rule_pattern || undefined,
        custom_label: cluster.custom_label || undefined,
      });

      // Reload proposal to ensure UI is in sync with backend
      const aid = accountId ? parseInt(accountId) : null;
      if (aid) {
        const updated = await classificationService.getProposal(aid);
        if (updated) setProposal(updated);
      } else {
        setProposal((prev) =>
          prev
            ? {
                ...prev,
                clusters: prev.clusters.map((c) =>
                  c.cluster_id === cluster.cluster_id ? { ...c, status: "accepted" as const } : c
                ),
              }
            : null
        );
      }
    } catch (e) {
      const msg =
        e && typeof e === "object" && "response" in e && e.response && typeof e.response === "object" && "data" in e.response
          ? (e.response as { data?: { detail?: string } }).data?.detail
          : null;
      setError(
        msg || `Erreur lors de la classification du cluster "${cluster.representative_label}".`
      );
    } finally {
      setProcessing(null);
    }
  };

  const handleSkip = (clusterId: number) => {
    patchCluster(clusterId, { status: "skipped" });
  };

  const handleModifyAccepted = async (
    cluster: ClassificationClusterResponse,
    newCategoryId: number
  ) => {
    const excluded = new Set(cluster.excluded_ids ?? []);
    const idsToClassify = cluster.transaction_ids.filter((id) => !excluded.has(id));
    if (idsToClassify.length === 0) return;

    setProcessing(cluster.cluster_id);
    setError(null);
    try {
      await classificationService.applyCluster(cluster.cluster_id, {
        transaction_ids: idsToClassify,
        category_id: newCategoryId,
        create_rule: true,
        rule_pattern: cluster.rule_pattern || undefined,
        custom_label: cluster.custom_label || undefined,
      });
      const aid = accountId ? parseInt(accountId) : null;
      if (aid) {
        const updated = await classificationService.getProposal(aid);
        if (updated) setProposal(updated);
      }
    } catch (e) {
      const msg =
        e && typeof e === "object" && "response" in e && e.response && typeof e.response === "object" && "data" in e.response
          ? (e.response as { data?: { detail?: string } }).data?.detail
          : null;
      setError(msg || `Erreur lors de la modification du cluster "${cluster.representative_label}".`);
    } finally {
      setProcessing(null);
    }
  };

  const handleOverrideCategory = (clusterId: number, categoryId: number | null) => {
    patchCluster(clusterId, { override_category_id: categoryId });
  };

  const handleApplyLlmSuggestion = (cluster: ClassificationClusterResponse) => {
    const suggestion = interpretResults[cluster.cluster_id]?.suggestion;
    if (!suggestion?.category_id) return;
    patchCluster(cluster.cluster_id, { override_category_id: suggestion.category_id });
  };

  const handleInterpret = async (cluster: ClassificationClusterResponse) => {
    setInterpretResults((prev) => ({ ...prev, [cluster.cluster_id]: "loading" }));
    setError(null);
    try {
      const result = await transactionService.interpretCluster({
        representative_label: cluster.representative_label,
        transactions: cluster.transactions ?? cluster.sample_transactions,
      });
      setInterpretResults((prev) => ({ ...prev, [cluster.cluster_id]: result }));

      const includeIds = result.suggestion?.suggested_include_ids;
      const allIds = new Set((cluster.transactions ?? cluster.sample_transactions).map((t) => t.id));
      if (includeIds && includeIds.length > 0 && includeIds.length < allIds.size) {
        const toExclude = [...allIds].filter((id) => !includeIds.includes(id));
        patchCluster(cluster.cluster_id, { excluded_ids: toExclude });
      } else if (includeIds && includeIds.length > 0) {
        patchCluster(cluster.cluster_id, { excluded_ids: [] });
      }
    } catch (e) {
      setInterpretResults((prev) => ({
        ...prev,
        [cluster.cluster_id]: {
          llm_available: false,
          raw_response: null,
          suggestion: null,
          error: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  };

  const handleRulePatternChange = (clusterId: number, value: string) => {
    patchCluster(clusterId, { rule_pattern: value || null });
  };

  const handleCustomLabelChange = (clusterId: number, value: string) => {
    patchCluster(clusterId, { custom_label: value || null });
  };

  const handleToggleExclude = (clusterId: number, txnId: number) => {
    const cluster = proposal?.clusters.find((c) => c.cluster_id === clusterId);
    if (!cluster) return;
    const excluded = new Set(cluster.excluded_ids ?? []);
    if (excluded.has(txnId)) excluded.delete(txnId);
    else excluded.add(txnId);
    patchCluster(clusterId, { excluded_ids: [...excluded] });
  };

  const [reclustering, setReclustering] = useState<number | null>(null);
  const [reclusterDebug, setReclusterDebug] = useState<ReclusterDebug | null>(null);
  const handleRecluster = async (cluster: ClassificationClusterResponse) => {
    if (cluster.transaction_count < 2) return;
    setReclustering(cluster.cluster_id);
    setError(null);
    setReclusterDebug(null);
    try {
      const { proposal: updatedProposal, debug } = await classificationService.reclusterCluster(
        cluster.cluster_id
      );
      setProposal(updatedProposal);
      setReclusterDebug(debug);
    } catch (e) {
      const msg =
        e && typeof e === "object" && "response" in e && e.response && typeof e.response === "object" && "data" in e.response
          ? (e.response as { data?: { detail?: string } }).data?.detail
          : null;
      setError(msg || "Erreur lors du recalcul du cluster.");
    } finally {
      setReclustering(null);
    }
  };

  const sortedClusters = proposal
    ? [...proposal.clusters].sort((a, b) =>
        sortBy === "amount"
          ? b.total_amount_abs - a.total_amount_abs
          : b.transaction_count - a.transaction_count
      )
    : [];
  const totalClusters = proposal?.clusters.length ?? 0;
  const acceptedCount = proposal?.clusters.filter((c) => c.status === "accepted").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Classification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Une proposition par compte. Sélectionnez un compte, lancez l&apos;analyse, puis appliquez les catégories.
          </p>
        </div>
        <Link
          to="/transactions"
          className="inline-flex items-center justify-center rounded-md font-medium transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 text-sm"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Retour aux transactions
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 p-4 rounded-xl border bg-card">
        <div className="flex-1 min-w-[180px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Compte</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Sélectionner un compte —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Niveau de sélection</label>
          <select
            value={clusterDistanceThreshold}
            onChange={(e) => setClusterDistanceThreshold(Number(e.target.value))}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            title="Plus sélectif = clusters plus homogènes"
          >
            {CLUSTER_SENSITIVITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={loading || !accountId}
          isLoading={loading}
          title={proposal ? "Recalculer les regroupements" : "Analyser les transactions non classées"}
        >
          {loading ? (
            "Analyse en cours..."
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {proposal ? "Recalculer" : "Analyser les suggestions"}
            </>
          )}
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Recluster debug — réponse LLM pour débogage */}
      {reclusterDebug && (
        <details className="rounded-lg border bg-muted/20 overflow-hidden">
          <summary className="px-4 py-2 cursor-pointer text-sm font-medium hover:bg-muted/30">
            Réponse LLM (fragmentation) — méthode : {reclusterDebug.method}
            {reclusterDebug.llm_parse_error && (
              <span className="ml-2 text-amber-600">— {reclusterDebug.llm_parse_error}</span>
            )}
          </summary>
          <div className="px-4 py-3 border-t space-y-2">
            {reclusterDebug.llm_raw_response ? (
              <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-words">
                {reclusterDebug.llm_raw_response}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pas de réponse LLM (fallback embeddings ou LLM indisponible).
              </p>
            )}
          </div>
        </details>
      )}

      {/* Loading proposal */}
      {loadingProposal && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Chargement...
          </div>
        </div>
      )}

      {/* Empty state — no account or no proposal */}
      {!loadingProposal && (!accountId || !proposal) && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-2">Classification</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            {!accountId
              ? "Sélectionnez un compte, puis cliquez sur « Analyser les suggestions » pour regrouper les transactions non classées."
              : "Cliquez sur « Analyser les suggestions » pour calculer les regroupements."}
          </p>
          {accountId && (
            <Button onClick={handleAnalyze} disabled={loading}>
              Lancer l&apos;analyse
            </Button>
          )}
        </div>
      )}

      {/* Results */}
      {!loadingProposal && proposal && proposal.clusters.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">
                {totalClusters} groupe{totalClusters > 1 ? "s" : ""} détecté{totalClusters > 1 ? "s" : ""}
              </span>
              {proposal.unclustered_count > 0 && (
                <span className="text-sm text-muted-foreground">
                  {proposal.unclustered_count} transaction{proposal.unclustered_count > 1 ? "s" : ""} isolée
                  {proposal.unclustered_count > 1 ? "s" : ""}
                </span>
              )}
              {acceptedCount > 0 && (
                <span className="text-sm text-emerald-600 dark:text-emerald-400">
                  {acceptedCount} / {totalClusters} classifié{acceptedCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Trier par :</span>
              <button
                type="button"
                onClick={() => setSortBy("amount")}
                className={`text-xs px-2 py-1 rounded ${sortBy === "amount" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              >
                Montant
              </button>
              <button
                type="button"
                onClick={() => setSortBy("count")}
                className={`text-xs px-2 py-1 rounded ${sortBy === "count" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              >
                Nombre
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {acceptedCount > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setAcceptedSectionExpanded((v) => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2 hover:text-foreground transition-colors"
                >
                  <span className="text-xs">{acceptedSectionExpanded ? "▼" : "▶"}</span>
                  Clusters déjà classés ({acceptedCount})
                </button>
                {acceptedSectionExpanded && (
                  <div className="space-y-3">
                    {sortedClusters
                      .filter((c) => c.status === "accepted")
                      .map((cluster) => (
                        <AcceptedClusterCard
                          key={cluster.cluster_id}
                          cluster={cluster}
                          flatCategories={flatCategories}
                          isProcessing={processing === cluster.cluster_id}
                          onModify={(newCategoryId) => handleModifyAccepted(cluster, newCategoryId)}
                          onCategoryDropdownOpen={fetchCategories}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}
            {sortedClusters.some((c) => c.status !== "accepted" && c.status !== "skipped") && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  À classer (
                  {sortedClusters.filter((c) => c.status !== "accepted" && c.status !== "skipped").length})
                </h3>
                <div className="space-y-3">
                  {sortedClusters
                    .filter((c) => c.status !== "accepted" && c.status !== "skipped")
                    .map((cluster) => {
                      const pending = pendingPatchRef.current.get(cluster.cluster_id);
                      return (
                        <ClusterCard
                          key={cluster.cluster_id}
                          cluster={cluster}
                          pendingOverrideCategoryId={pending?.override_category_id as number | null | undefined}
                          pendingCustomLabel={pending?.custom_label as string | undefined}
                          pendingRulePattern={pending?.rule_pattern as string | undefined}
                          flatCategories={flatCategories}
                          interpretResult={interpretResults[cluster.cluster_id]}
                          isProcessing={processing === cluster.cluster_id}
                          llmUiEnabled={llmUiEnabled}
                          onAccept={() => handleAccept(cluster)}
                          onSkip={() => handleSkip(cluster.cluster_id)}
                          onOverrideCategory={(catId) => handleOverrideCategory(cluster.cluster_id, catId)}
                          onApplyLlmSuggestion={() => handleApplyLlmSuggestion(cluster)}
                          onInterpret={() => handleInterpret(cluster)}
                          onRulePatternChange={(v) => handleRulePatternChange(cluster.cluster_id, v)}
                          onCustomLabelChange={(v) => handleCustomLabelChange(cluster.cluster_id, v)}
                          onToggleExclude={(txnId) => handleToggleExclude(cluster.cluster_id, txnId)}
                          onRecluster={() => handleRecluster(cluster)}
                          isReclustering={reclustering === cluster.cluster_id}
                          onCategoryDropdownOpen={fetchCategories}
                        />
                      );
                    })}
                </div>
              </div>
            )}
            {sortedClusters.some((c) => c.status === "skipped") && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Ignorés ({sortedClusters.filter((c) => c.status === "skipped").length})
                </h3>
                <div className="space-y-3">
                  {sortedClusters
                    .filter((c) => c.status === "skipped")
                    .map((cluster) => (
                      <div key={cluster.cluster_id} className="rounded-lg border p-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{cluster.representative_label}</span>
                          <span className="text-xs text-muted-foreground">Ignoré</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {proposal.total_uncategorized} transaction{proposal.total_uncategorized !== 1 ? "s" : ""} non
              classée{proposal.total_uncategorized !== 1 ? "s" : ""} au total
            </div>
          </div>
        </div>
      )}

      {/* Proposal exists but empty clusters */}
      {!loadingProposal && proposal && proposal.clusters.length === 0 && proposal.total_uncategorized > 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <p>Toutes les transactions sont classées ou il n&apos;y a pas assez de données pour former des groupes.</p>
          <Button variant="outline" className="mt-4" onClick={handleAnalyze}>
            Recalculer
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Accepted cluster card (éditable) ─────────────────────────

function AcceptedClusterCard({
  cluster,
  flatCategories,
  isProcessing,
  onModify,
  onCategoryDropdownOpen,
}: {
  cluster: ClassificationClusterResponse;
  flatCategories: { id: number; name: string; parentName: string | null; depth: number }[];
  isProcessing: boolean;
  onModify: (categoryId: number) => void;
  onCategoryDropdownOpen?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const currentCatId = cluster.override_category_id ?? cluster.suggested_category_id;
  const [editCategoryId, setEditCategoryId] = useState<number | null>(currentCatId);
  useEffect(() => {
    setEditCategoryId(currentCatId);
  }, [currentCatId]);
  const categoryName =
    currentCatId != null
      ? flatCategories.find((c) => c.id === currentCatId)?.name ?? "?"
      : null;
  const transactions = cluster.transactions ?? cluster.sample_transactions;

  return (
    <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800 overflow-hidden">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{cluster.representative_label}</span>
            <span className="text-xs text-muted-foreground">
              {cluster.transaction_count} tx · {formatCurrency(cluster.total_amount_abs)}
            </span>
            {categoryName && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                → {categoryName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            className="rounded border border-input bg-background px-2 py-1.5 text-sm min-w-[140px]"
            value={editCategoryId ?? ""}
            onChange={(e) => setEditCategoryId(e.target.value ? parseInt(e.target.value) : null)}
            onFocus={() => onCategoryDropdownOpen?.()}
          >
            <option value="">— Changer la catégorie —</option>
            {flatCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.depth > 0 ? "\u00A0\u00A0".repeat(cat.depth) : ""}
                {cat.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!editCategoryId || isProcessing || editCategoryId === currentCatId}
            isLoading={isProcessing}
            onClick={() => editCategoryId && onModify(editCategoryId)}
          >
            {!isProcessing && "Modifier"}
          </Button>
        </div>
      </div>
      <div className="border-t border-emerald-200/50 dark:border-emerald-800/50">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-emerald-100/30 dark:hover:bg-emerald-900/20 flex items-center gap-1"
        >
          {showDetails ? "▼" : "▶"} Voir les transactions
        </button>
        {showDetails && transactions.length > 0 && (
          <div className="px-4 pb-4">
            <div className="max-h-40 overflow-y-auto space-y-0.5 rounded border bg-background/50 p-2">
              {transactions.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center gap-2 text-xs py-0.5"
                >
                  <span className="text-muted-foreground shrink-0 w-16">{formatDate(txn.date)}</span>
                  <span className="truncate flex-1 min-w-0">{txn.label_raw}</span>
                  <span
                    className={`shrink-0 font-medium ${txn.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {formatCurrency(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cluster card (pending) ─────────────────────────────────────

function ClusterCard({
  cluster,
  pendingOverrideCategoryId,
  pendingCustomLabel,
  pendingRulePattern,
  flatCategories,
  interpretResult,
  isProcessing,
  llmUiEnabled,
  onAccept,
  onSkip,
  onOverrideCategory,
  onApplyLlmSuggestion,
  onInterpret,
  onRulePatternChange,
  onCustomLabelChange,
  onToggleExclude,
  onRecluster,
  isReclustering,
  onCategoryDropdownOpen,
}: {
  cluster: ClassificationClusterResponse;
  pendingOverrideCategoryId?: number | null;
  pendingCustomLabel?: string;
  pendingRulePattern?: string;
  flatCategories: { id: number; name: string; parentName: string | null; depth: number }[];
  interpretResult: InterpretClusterResult | "loading" | undefined;
  isProcessing: boolean;
  llmUiEnabled: boolean;
  onAccept: () => void;
  onSkip: () => void;
  onOverrideCategory: (catId: number | null) => void;
  onApplyLlmSuggestion: () => void;
  onInterpret: () => void;
  onRulePatternChange: (v: string) => void;
  onCustomLabelChange: (v: string) => void;
  onToggleExclude: (txnId: number) => void;
  onRecluster: () => void;
  isReclustering: boolean;
  onCategoryDropdownOpen?: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const excludedSet = new Set(cluster.excluded_ids ?? []);
  const includedCount = cluster.transaction_count - excludedSet.size;

  // Use pending values so category + custom_label + rule_pattern stay independent during rapid edits
  const effectiveCategoryId =
    (pendingOverrideCategoryId !== undefined ? pendingOverrideCategoryId : cluster.override_category_id) ??
    cluster.suggested_category_id ??
    interpretResult?.suggestion?.category_id;
  const effectiveCategoryName =
    effectiveCategoryId != null
      ? flatCategories.find((c) => c.id === effectiveCategoryId)?.name ?? "?"
      : cluster.suggested_category_name ?? interpretResult?.suggestion?.category_name ?? null;
  const hasSuggestion = effectiveCategoryId != null;

  const transactions = cluster.transactions ?? cluster.sample_transactions;
  const llmSuggestion = interpretResult !== "loading" && interpretResult?.suggestion;
  const hasLlmSubselection = llmSuggestion?.suggested_include_ids && llmSuggestion.suggested_include_ids.length < transactions.length;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{cluster.representative_label}</span>
            <span className="text-xs text-muted-foreground">
              {cluster.transaction_count} tx · {formatCurrency(cluster.total_amount_abs)}
            </span>
            {excludedSet.size > 0 && (
              <span className="text-xs text-amber-600">
                ({includedCount} sélectionnée{includedCount > 1 ? "s" : ""})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <select
            className="rounded border border-input bg-background px-2 py-1.5 text-sm min-w-[140px]"
            value={effectiveCategoryId ?? ""}
            onChange={(e) => onOverrideCategory(e.target.value ? parseInt(e.target.value) : null)}
            onFocus={() => onCategoryDropdownOpen?.()}
          >
            <option value="">— Catégorie —</option>
            {flatCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.depth > 0 ? "\u00A0\u00A0".repeat(cat.depth) : ""}
                {cat.name}
              </option>
            ))}
          </select>

          {llmUiEnabled && (
            <Button
              variant="outline"
              size="sm"
              disabled={interpretResult === "loading" || isProcessing}
              isLoading={interpretResult === "loading"}
              onClick={onInterpret}
              title="Analyser avec l'IA : catégorie + sous-sélection"
            >
              {interpretResult === "loading" ? "Analyse IA..." : "Analyser (IA)"}
            </Button>
          )}

          <Button
            size="sm"
            disabled={!hasSuggestion || isProcessing || includedCount === 0}
            isLoading={isProcessing}
            onClick={onAccept}
          >
            Appliquer
          </Button>
          <Button variant="ghost" size="sm" disabled={isProcessing} onClick={onSkip}>
            Ignorer
          </Button>
        </div>
      </div>

      {llmSuggestion && (
        <div className="px-4 pb-2 flex flex-wrap items-center gap-2">
          <div className="rounded-md bg-muted/30 px-2 py-1.5 text-xs flex-1 min-w-0">
            <span className="text-muted-foreground">IA : </span>
            <span className="font-medium">{llmSuggestion.category_name}</span>
            {llmSuggestion.explanation && (
              <span className="text-muted-foreground italic ml-1">— {llmSuggestion.explanation}</span>
            )}
            {hasLlmSubselection && (
              <span className="text-amber-600 ml-1">
                (sous-sélection appliquée : {llmSuggestion.suggested_include_ids!.length} tx)
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isProcessing}
            onClick={onApplyLlmSuggestion}
            title="Utiliser cette suggestion comme catégorie"
          >
            Utiliser la suggestion IA
          </Button>
        </div>
      )}

      <div className="border-t">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 flex items-center gap-1"
        >
          {showAdvanced ? "▼" : "▶"} Ajuster la sélection et les options
        </button>
        {showAdvanced && (
          <div className="p-4 pt-0 space-y-4">
            {cluster.transaction_count >= 2 && (
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isReclustering}
                  isLoading={isReclustering}
                  onClick={onRecluster}
                  title="Fragmenter ce cluster en sous-groupes plus homogènes"
                >
                  {!isReclustering && "Fragmenter le cluster"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Recalcule avec un seuil plus strict si le groupe semble hétérogène.
                </p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Transactions — décocher pour exclure
              </p>
              <div className="max-h-40 overflow-y-auto space-y-0.5 rounded border bg-muted/20 p-2">
                {transactions.map((txn) => {
                  const excluded = excludedSet.has(txn.id);
                  return (
                    <label
                      key={txn.id}
                      className={`flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 ${excluded ? "opacity-50" : ""}`}
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
                        {formatCurrency(txn.amount)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Motif règle</label>
                <input
                  type="text"
                  placeholder={cluster.representative_label}
                  value={pendingRulePattern !== undefined ? (pendingRulePattern ?? "") : (cluster.rule_pattern ?? "")}
                  onChange={(e) => onRulePatternChange(e.target.value)}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-sm mt-0.5"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Libellé personnalisé</label>
                <input
                  type="text"
                  placeholder="Ex: Amazon"
                  value={pendingCustomLabel !== undefined ? (pendingCustomLabel ?? "") : (cluster.custom_label ?? "")}
                  onChange={(e) => onCustomLabelChange(e.target.value)}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-sm mt-0.5"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
