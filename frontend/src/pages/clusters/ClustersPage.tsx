/**
 * Clusters page — visualize and manage transaction_clusters.
 *
 * Lists persisted clusters with:
 * - Stats (with recompute)
 * - Transactions
 * - Time series visualization
 * - Edit (name, description, category)
 * - Link to classification proposal when proposal_cluster_id is set
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { clusterService, type ClusterTransaction } from "../../services/cluster.service";
import { accountService } from "../../services/account.service";
import { categoryService } from "../../services/category.service";
import type { TransactionCluster } from "../../types/classification.types";
import type { Account } from "../../types/account.types";
import type { Category } from "../../types/category.types";
import { formatCurrency, formatDate } from "../../utils/format";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Repeat2, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Copy, ClipboardPaste, Pencil, Check, X, Loader2, Plus, Settings } from "lucide-react";

type SortField = "name" | "amount" | "recurrence" | "trend";
type SortDir = "asc" | "desc";

const RECURRENCE_ORDER: Record<string, number> = {
  daily: 1,
  weekly: 2,
  biweekly: 3,
  monthly: 4,
  quarterly: 5,
  biannual: 6,
  yearly: 7,
  irregular: 8,
};

const TREND_ORDER: Record<string, number> = {
  decreasing: 1,
  stable: 2,
  increasing: 3,
};

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Quotidien",
  weekly: "Hebdomadaire",
  biweekly: "Bi-hebdo",
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  biannual: "Semestriel",
  yearly: "Annuel",
  irregular: "Irrégulier",
};

function formatRecurrence(pattern: string): string {
  return RECURRENCE_LABELS[pattern] ?? pattern;
}

function Sparkline({
  data,
  id,
  totalAmount,
}: {
  data: { date: string; amount: number }[];
  id: string;
  totalAmount: number | null;
}) {
  if (data.length < 2) return null;
  const values = data.map((d) => d.amount);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const normalized = data.map((d) => ({ ...d, norm: (d.amount - min) / range }));
  const gradId = `sparkline-${id}`;
  const isIncome = totalAmount == null || totalAmount >= 0;
  const strokeColor = isIncome ? "#10b981" : "#ef4444";

  return (
    <div className="w-20 h-7 shrink-0 rounded bg-muted/40 dark:bg-muted/30 overflow-hidden" title="Fréquence / variation (valeur absolue)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={normalized} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis domain={[0, 1]} hide />
          <Area
            type="monotone"
            dataKey="norm"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildSparklineData(transactions: ClusterTransaction[]): { date: string; amount: number }[] {
  const byDate = new Map<string, number>();
  for (const t of transactions) {
    const d = t.date;
    byDate.set(d, (byDate.get(d) ?? 0) + Math.abs(t.amount));
  }
  return [...byDate.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildTimeSeriesData(transactions: ClusterTransaction[]): { date: string; amount: number; count: number }[] {
  const byDate = new Map<string, { amount: number; count: number }>();
  for (const t of transactions) {
    const d = t.date;
    const cur = byDate.get(d) ?? { amount: 0, count: 0 };
    cur.amount += t.amount;
    cur.count += 1;
    byDate.set(d, cur);
  }
  return [...byDate.entries()]
    .map(([date, { amount, count }]) => ({ date, amount, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default function ClustersPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [clusters, setClusters] = useState<TransactionCluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recomputeAllConfirm, setRecomputeAllConfirm] = useState(false);
  const [recomputeAllProgress, setRecomputeAllProgress] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [clipBoard, setClipBoard] = useState<{
    sourceClusterId: number;
    sourceClusterName: string;
    transactionIds: number[];
  } | null>(null);
  const [selectionByCluster, setSelectionByCluster] = useState<Record<number, Set<number>>>({});
  const [pasteConfirm, setPasteConfirm] = useState<{
    targetClusterId: number;
    targetClusterName: string;
  } | null>(null);
  const [pasting, setPasting] = useState(false);
  const [createFromSelectionOpen, setCreateFromSelectionOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedTransactionIds = (() => {
    if (clipBoard?.transactionIds?.length) return clipBoard.transactionIds;
    return Object.values(selectionByCluster).flatMap((s) => Array.from(s));
  })();
  const selectedCount = selectedTransactionIds.length;

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await clusterService.list(
        accountId || undefined,
        categoryId || undefined
      );
      setClusters(list);
    } catch {
      setError("Impossible de charger les clusters.");
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, categoryId]);

  useEffect(() => {
    accountService.list().then(setAccounts).catch(() => {});
    categoryService.list().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  const sortedClusters = [...clusters].sort((a, b) => {
    const mult = sortDir === "asc" ? 1 : -1;
    switch (sortBy) {
      case "name":
        return mult * (a.name.localeCompare(b.name, "fr"));
      case "amount":
        return mult * ((a.total_amount_abs ?? 0) - (b.total_amount_abs ?? 0));
      case "recurrence": {
        const orderA = a.recurrence_pattern ? RECURRENCE_ORDER[a.recurrence_pattern] ?? 9 : a.is_recurring ? 0 : 10;
        const orderB = b.recurrence_pattern ? RECURRENCE_ORDER[b.recurrence_pattern] ?? 9 : b.is_recurring ? 0 : 10;
        return mult * (orderA - orderB);
      }
      case "trend": {
        const orderA = a.statistics?.trend ? TREND_ORDER[a.statistics.trend] ?? 2 : 0;
        const orderB = b.statistics?.trend ? TREND_ORDER[b.statistics.trend] ?? 2 : 0;
        return mult * (orderA - orderB);
      }
      default:
        return 0;
    }
  });

  const handleToggleSelection = useCallback((clusterId: number, txId: number) => {
    setSelectionByCluster((prev) => {
      const next = { ...prev };
      const set = new Set(next[clusterId] ?? []);
      if (set.has(txId)) set.delete(txId);
      else set.add(txId);
      next[clusterId] = set;
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((clusterId: number, txIds: number[]) => {
    setSelectionByCluster((prev) => ({
      ...prev,
      [clusterId]: new Set(txIds),
    }));
  }, []);

  const handleCopy = useCallback((clusterId: number, clusterName: string) => {
    const selected = selectionByCluster[clusterId];
    if (!selected || selected.size === 0) return;
    setClipBoard({
      sourceClusterId: clusterId,
      sourceClusterName: clusterName,
      transactionIds: Array.from(selected),
    });
  }, [selectionByCluster]);

  const handlePasteClick = useCallback((targetClusterId: number, targetClusterName: string) => {
    if (!clipBoard || clipBoard.sourceClusterId === targetClusterId) return;
    setPasteConfirm({ targetClusterId, targetClusterName });
  }, [clipBoard]);

  const handlePasteConfirm = useCallback(async () => {
    if (!pasteConfirm || !clipBoard) return;
    setPasting(true);
    try {
      await clusterService.moveTransactions(
        pasteConfirm.targetClusterId,
        clipBoard.transactionIds,
        clipBoard.sourceClusterId
      );
      setClipBoard(null);
      setSelectionByCluster({});
      setPasteConfirm(null);
      await fetchClusters();
    } catch {
      // Error handled by api interceptor or we could add toast
    } finally {
      setPasting(false);
    }
  }, [pasteConfirm, clipBoard, fetchClusters]);

  const handleRecomputeAll = async () => {
    if (clusters.length === 0) return;
    setRecomputeAllConfirm(false);
    setRecomputeAllProgress(0);
    const total = clusters.length;
    for (let i = 0; i < total; i++) {
      try {
        await clusterService.recompute(clusters[i].id);
      } catch {
        /* continue on error */
      }
      setRecomputeAllProgress(i + 1);
    }
    setRecomputeAllProgress(null);
    await fetchClusters();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] min-h-[400px]">
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clusters</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualisez et gérez les regroupements de transactions persistés.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setCreateFromSelectionOpen(true)}
          disabled={selectedCount === 0}
          title="Créer un nouveau cluster avec les transactions sélectionnées"
          className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Créer un cluster à partir de la sélection ({selectedCount})
        </Button>
      </div>

      {/* Filters — fixed at top */}
      <div className="shrink-0 mt-4 flex flex-wrap items-end gap-4 p-4 rounded-xl border bg-card">
        <div className="min-w-[180px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Compte</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value ? parseInt(e.target.value) : "")}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Tous les comptes</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : "")}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Toutes</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Trier par</label>
          <div className="flex gap-1">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="name">Nom</option>
              <option value="amount">Montant</option>
              <option value="recurrence">Récurrence</option>
              <option value="trend">Tendance</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded border border-input bg-background px-2 py-2 text-sm hover:bg-muted/50 transition-colors"
              title={sortDir === "asc" ? "Croissant (cliquer pour décroissant)" : "Décroissant (cliquer pour croissant)"}
            >
              {sortDir === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <Button variant="outline" onClick={fetchClusters} disabled={loading}>
          Actualiser
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {recomputeAllProgress != null && (
            <span className="text-xs text-muted-foreground">
              Recalcul {recomputeAllProgress} / {clusters.length}
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => setRecomputeAllConfirm(true)}
            disabled={loading || clusters.length === 0 || recomputeAllProgress != null}
            title="Recalculer les statistiques de tous les clusters affichés"
          >
            Tout recalculer
          </Button>
        </div>
      </div>

      {/* Cluster count */}
      <div className="shrink-0 mt-2 text-sm text-muted-foreground">
        {loading ? "—" : `${sortedClusters.length} cluster${sortedClusters.length !== 1 ? "s" : ""}`}
      </div>

      {/* Confirmation dialog */}
      {recomputeAllConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setRecomputeAllConfirm(false)}
        >
          <div
            className="bg-card rounded-xl border shadow-lg p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Tout recalculer</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Cette opération va recalculer les statistiques pour les {clusters.length} cluster
              {clusters.length > 1 ? "s" : ""} affiché{clusters.length > 1 ? "s" : ""}. Cela peut prendre
              plusieurs secondes.
            </p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
              ⚠️ Opération potentiellement lente.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRecomputeAllConfirm(false)}>
                Annuler
              </Button>
              <Button onClick={handleRecomputeAll}>
                Confirmer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Paste confirmation */}
      {pasteConfirm && clipBoard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setPasteConfirm(null)}
        >
          <div
            className="bg-card rounded-xl border shadow-lg p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Déplacer les transactions</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Déplacer {clipBoard.transactionIds.length} transaction
              {clipBoard.transactionIds.length > 1 ? "s" : ""} de <strong>{clipBoard.sourceClusterName}</strong> vers{" "}
              <strong>{pasteConfirm.targetClusterName}</strong> ?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPasteConfirm(null)} disabled={pasting}>
                Annuler
              </Button>
              <Button onClick={handlePasteConfirm} disabled={pasting} isLoading={pasting}>
                Déplacer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create cluster from selection dialog */}
      {createFromSelectionOpen && (
        <CreateFromSelectionDialog
          transactionIds={selectedTransactionIds}
          flatCategories={flattenCategories(categories)}
          onClose={() => setCreateFromSelectionOpen(false)}
          onSuccess={() => {
            setCreateFromSelectionOpen(false);
            setClipBoard(null);
            setSelectionByCluster({});
            fetchClusters();
          }}
          creating={creating}
          setCreating={setCreating}
        />
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Scrollable cluster list */}
      <div className="flex-1 min-h-0 overflow-y-auto mt-4 pr-1">
        {loading ? (
          <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
            Chargement...
          </div>
        ) : clusters.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
            <p>Aucun cluster enregistré.</p>
            <p className="text-xs mt-2">
              Créez des clusters depuis l&apos;écran Classification (Sauvegarder en cluster ou Appliquer).
            </p>
          </div>
        ) : (
          <div className="space-y-4">
          {sortedClusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              flatCategories={flattenCategories(categories)}
              onUpdated={fetchClusters}
              clipBoard={clipBoard}
              selection={selectionByCluster[cluster.id]}
              onToggleSelection={handleToggleSelection}
              onSelectAll={handleSelectAll}
              onCopy={handleCopy}
              onPasteClick={handlePasteClick}
            />
          ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateFromSelectionDialog({
  transactionIds,
  flatCategories,
  onClose,
  onSuccess,
  creating,
  setCreating,
}: {
  transactionIds: number[];
  flatCategories: { id: number; name: string; depth: number }[];
  onClose: () => void;
  onSuccess: () => void;
  creating: boolean;
  setCreating: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [rulePattern, setRulePattern] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "exact" | "starts_with" | "regex">("contains");
  const [createRule, setCreateRule] = useState(false);
  const [suggestingPattern, setSuggestingPattern] = useState(true);
  const [suggestingName, setSuggestingName] = useState(true);
  const [validationResult, setValidationResult] = useState<{
    match_count: number;
    total: number;
    unmatched: { id: number; label_raw: string }[];
  } | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (transactionIds.length === 0) {
      setSuggestingPattern(false);
      setSuggestingName(false);
      return;
    }
    Promise.all([
      clusterService.suggestPattern(transactionIds),
      clusterService.suggestName(transactionIds),
    ])
      .then(([patternRes, nameRes]) => {
        if (patternRes.suggested_pattern) setRulePattern(patternRes.suggested_pattern);
        if (nameRes.suggested_name) setName(nameRes.suggested_name);
      })
      .catch(() => {})
      .finally(() => {
        setSuggestingPattern(false);
        setSuggestingName(false);
      });
  }, [transactionIds]);

  useEffect(() => {
    setValidationResult(null);
  }, [rulePattern, matchType]);

  const handleValidatePattern = async () => {
    if (!rulePattern.trim() || transactionIds.length === 0) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await clusterService.validatePattern(transactionIds, rulePattern.trim(), matchType);
      setValidationResult(result);
    } catch {
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || transactionIds.length === 0) return;
    if (createRule && (!rulePattern.trim() || !categoryId)) return;

    setCreating(true);
    try {
      await clusterService.createFromSelection({
        transaction_ids: transactionIds,
        name: trimmedName,
        category_id: categoryId || undefined,
        description: description.trim() || undefined,
        rule_pattern: rulePattern.trim() || undefined,
        match_type: matchType,
        create_rule: createRule,
      });
      onSuccess();
    } catch {
      // Error handled by api
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border shadow-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">Créer un cluster à partir de la sélection</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {transactionIds.length} transaction{transactionIds.length > 1 ? "s" : ""} seront regroupées dans un nouveau cluster.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nom du cluster *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm mt-1"
              placeholder={suggestingName ? "Suggestion en cours..." : "Ex: Abonnement Netflix"}
              required
            />
            {!suggestingName && name && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Suggestion basée sur les libellés et la fréquence des transactions
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : "")}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm mt-1"
            >
              <option value="">— Aucune —</option>
              {flatCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {"\u00A0".repeat(c.depth)}{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm mt-1 min-h-[60px]"
              placeholder="Optionnel"
            />
          </div>

          <div className="border-t pt-4 space-y-3">
            <h4 className="text-sm font-medium">Règle automatique de détection</h4>
            <p className="text-xs text-muted-foreground">
              Optionnel : associer un motif pour identifier les futures transactions. Contient : sous-chaîne ou
              plusieurs avec <code className="px-0.5 rounded bg-muted"> % </code> (ex: <code className="px-0.5 rounded bg-muted">XYZ % ABC</code> = contient XYZ et ABC).
              Regex disponible.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Motif (pattern)</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={rulePattern}
                  onChange={(e) => setRulePattern(e.target.value)}
                  className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
                  placeholder={
                    suggestingPattern
                      ? "Suggestion en cours..."
                      : "Ex: NETFLIX, XYZ % ABC (multiple), ou .*abonnement.* (regex)"
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleValidatePattern}
                  disabled={!rulePattern.trim() || validating}
                  isLoading={validating}
                  title="Tester que le motif identifie bien les transactions sélectionnées"
                >
                  Valider
                </Button>
              </div>
              {validationResult && (
                <p
                  className={`text-xs mt-1.5 ${
                    validationResult.match_count === validationResult.total
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {validationResult.match_count}/{validationResult.total} transaction
                  {validationResult.total > 1 ? "s" : ""} identifiée
                  {validationResult.total > 1 ? "s" : ""}
                  {validationResult.unmatched.length > 0 && (
                    <span className="block mt-1 text-muted-foreground">
                      Non matchées :{" "}
                      {validationResult.unmatched
                        .slice(0, 3)
                        .map((u) => `"${u.label_raw.length > 40 ? u.label_raw.slice(0, 37) + "…" : u.label_raw}"`)
                        .join(", ")}
                      {validationResult.unmatched.length > 3 &&
                        ` (+${validationResult.unmatched.length - 3} autre${validationResult.unmatched.length > 4 ? "s" : ""})`}
                    </span>
                  )}
                </p>
              )}
              {!suggestingPattern && rulePattern && !validationResult && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Suggestion basée sur les libellés des transactions sélectionnées
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type de correspondance</label>
              <select
                value={matchType}
                onChange={(e) =>
                  setMatchType(e.target.value as "contains" | "exact" | "starts_with" | "regex")
                }
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm mt-1"
              >
                <option value="contains">Contient (sous-chaîne ou A % B pour multiple)</option>
                <option value="exact">Exact</option>
                <option value="starts_with">Commence par</option>
                <option value="regex">Expression régulière (regex)</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createRule}
                onChange={(e) => setCreateRule(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-sm">Créer une règle de classification (catégorie requise)</span>
            </label>
            {createRule && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Une règle sera créée pour classer automatiquement les futures transactions correspondantes.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={creating}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={creating || !name.trim() || (createRule && (!rulePattern.trim() || !categoryId))}
              isLoading={creating}
            >
              Créer le cluster
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetectionConfigDialog({
  cluster,
  onClose,
  onSaved,
}: {
  cluster: TransactionCluster;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rulePattern, setRulePattern] = useState(cluster.rule_pattern || "");
  const [matchType, setMatchType] = useState<"contains" | "exact" | "starts_with" | "regex">(
    (cluster.match_type as "contains" | "exact" | "starts_with" | "regex") || "contains"
  );
  const [validationResult, setValidationResult] = useState<{
    match_count: number;
    total: number;
    unmatched: { id: number; label_raw: string }[];
  } | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValidationResult(null);
  }, [rulePattern, matchType]);

  const transactionIds = cluster.transaction_ids || [];

  const handleValidate = async () => {
    if (!rulePattern.trim() || transactionIds.length === 0) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await clusterService.validatePattern(transactionIds, rulePattern.trim(), matchType);
      setValidationResult(result);
    } catch {
      setValidationResult(null);
    } finally {
      setValidating(false);
    }
  };

  const handleSuggest = async () => {
    if (transactionIds.length === 0) return;
    try {
      const res = await clusterService.suggestPattern(transactionIds);
      if (res.suggested_pattern) setRulePattern(res.suggested_pattern);
    } catch {
      /* ignore */
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await clusterService.update(cluster.id, {
        rule_pattern: rulePattern.trim() || null,
        match_type: rulePattern.trim() ? matchType : null,
      });
      onSaved();
      onClose();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl border shadow-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2">Config de détection</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Motif et type de correspondance pour identifier les futures transactions de ce cluster.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Motif (pattern)</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={rulePattern}
                onChange={(e) => setRulePattern(e.target.value)}
                className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
                placeholder="Ex: NETFLIX, XYZ % ABC, ou .*abonnement.* (regex)"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSuggest}
                disabled={transactionIds.length === 0}
                title="Suggérer un motif"
              >
                Suggérer
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type de correspondance</label>
            <select
              value={matchType}
              onChange={(e) =>
                setMatchType(e.target.value as "contains" | "exact" | "starts_with" | "regex")
              }
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm mt-1"
            >
              <option value="contains">Contient (sous-chaîne ou A % B pour multiple)</option>
              <option value="exact">Exact</option>
              <option value="starts_with">Commence par</option>
              <option value="regex">Expression régulière (regex)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={!rulePattern.trim() || validating || transactionIds.length === 0}
              isLoading={validating}
              title="Tester le motif sur les transactions du cluster"
            >
              Tester
            </Button>
            {validationResult && (
              <span
                className={`text-xs self-center ${
                  validationResult.match_count === validationResult.total
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {validationResult.match_count}/{validationResult.total} matchées
                {validationResult.unmatched.length > 0 &&
                  ` — non matchées : ${validationResult.unmatched.slice(0, 2).map((u) => `"${u.label_raw.slice(0, 25)}…"`).join(", ")}`}
              </span>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={handleSave} disabled={saving} isLoading={saving}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

function flattenCategories(cats: Category[]): { id: number; name: string; depth: number }[] {
  const out: { id: number; name: string; depth: number }[] = [];
  const walk = (c: Category[], d: number) => {
    for (const x of c) {
      out.push({ id: x.id, name: x.name, depth: d });
      if (x.children?.length) walk(x.children, d + 1);
    }
  };
  walk(cats, 0);
  return out;
}

function ClusterCard({
  cluster,
  flatCategories,
  onUpdated,
  clipBoard,
  selection,
  onToggleSelection,
  onSelectAll,
  onCopy,
  onPasteClick,
}: {
  cluster: TransactionCluster;
  flatCategories: { id: number; name: string; depth: number }[];
  onUpdated: () => void;
  clipBoard: { sourceClusterId: number; sourceClusterName: string; transactionIds: number[] } | null;
  selection: Set<number> | undefined;
  onToggleSelection: (clusterId: number, txId: number) => void;
  onSelectAll: (clusterId: number, txIds: number[]) => void;
  onCopy: (clusterId: number, clusterName: string) => void;
  onPasteClick: (targetClusterId: number, targetClusterName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [transactions, setTransactions] = useState<ClusterTransaction[] | null>(null);
  const [loadingTx, setLoadingTx] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(cluster.name);
  const [editDesc, setEditDesc] = useState(cluster.description ?? "");
  const [editCatId, setEditCatId] = useState<number | null>(cluster.category_id);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [editingNameInline, setEditingNameInline] = useState(false);
  const [editingCategoryInline, setEditingCategoryInline] = useState(false);
  const [detectionConfigOpen, setDetectionConfigOpen] = useState(false);
  const hasDetectionConfig = !!(cluster.rule_pattern || cluster.match_type);
  const openDetectionConfig = () => setDetectionConfigOpen(true);

  useEffect(() => {
    setEditName(cluster.name);
    setEditDesc(cluster.description ?? "");
    setEditCatId(cluster.category_id);
  }, [cluster]);

  useEffect(() => {
    if (cluster.transaction_count > 0) {
      setLoadingTx(true);
      clusterService
        .getTransactions(cluster.id)
        .then(setTransactions)
        .catch(() => setTransactions([]))
        .finally(() => setLoadingTx(false));
    } else {
      setTransactions(null);
    }
  }, [cluster.id, cluster.transaction_count]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await clusterService.update(cluster.id, {
        name: editName,
        description: editDesc || undefined,
        category_id: editCatId,
      });
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await clusterService.recompute(cluster.id);
      onUpdated();
    } finally {
      setRecomputing(false);
    }
  };

  const handleSaveNameInline = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === cluster.name) {
      setEditingNameInline(false);
      setEditName(cluster.name);
      return;
    }
    setSaving(true);
    try {
      await clusterService.update(cluster.id, { name: trimmed });
      setEditingNameInline(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleCancelNameInline = () => {
    setEditName(cluster.name);
    setEditingNameInline(false);
  };

  const handleSaveCategoryInline = async (newCatId: number | null) => {
    setSaving(true);
    try {
      await clusterService.update(cluster.id, { category_id: newCatId });
      setEditCatId(newCatId);
      setEditingCategoryInline(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const catName = editCatId != null ? flatCategories.find((c) => c.id === editCatId)?.name : null;
  const sparklineData = transactions ? buildSparklineData(transactions) : [];
  const timeSeriesData = transactions ? buildTimeSeriesData(transactions) : [];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2 shrink-0">
            {loadingTx ? (
              <div className="w-20 h-7 rounded bg-muted/40 animate-pulse" />
            ) : (
              sparklineData.length >= 2 && (
                <Sparkline data={sparklineData} id={String(cluster.id)} totalAmount={cluster.total_amount} />
              )
            )}
          </div>
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {editingNameInline ? (
                <div
                  className="flex items-center gap-1 shrink-0 min-w-[120px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveNameInline();
                      if (e.key === "Escape") handleCancelNameInline();
                    }}
                    className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 text-sm font-medium"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveNameInline}
                    disabled={saving || !editName.trim()}
                    className="p-0.5 rounded hover:bg-muted text-emerald-600 disabled:opacity-50"
                    title="Enregistrer"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelNameInline}
                    disabled={saving}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                    title="Annuler"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span className="font-medium truncate">{cluster.name}</span>
              )}
              {!editingNameInline && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingNameInline(true);
                  }}
                  className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground shrink-0"
                  title="Modifier le nom"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="text-xs text-muted-foreground shrink-0">
                {cluster.transaction_count} tx
              </span>
              {cluster.total_amount != null && (
                <span
                  className={`text-xs font-medium shrink-0 ${
                    cluster.total_amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {formatCurrency(cluster.total_amount)}
                </span>
              )}
              {cluster.total_amount == null && (
                <span className="text-xs text-muted-foreground shrink-0">—</span>
              )}
            </div>
          <div className="flex items-center gap-2 flex-wrap">
            {editingCategoryInline ? (
              <div
                className="flex items-center gap-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <select
                  value={editCatId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    handleSaveCategoryInline(val);
                  }}
                  onKeyDown={(e) => e.key === "Escape" && setEditingCategoryInline(false)}
                  className="rounded border border-input bg-background px-2 py-0.5 text-[11px] font-medium min-w-[120px]"
                  autoFocus
                >
                  <option value="">— Aucune —</option>
                  {flatCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {"\u00A0".repeat(c.depth)}{c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setEditingCategoryInline(false)}
                  disabled={saving}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                  title="Annuler"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingCategoryInline(true);
                }}
                className={
                  catName
                    ? "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400/90 dark:bg-emerald-500/20 hover:ring-1 hover:ring-emerald-500/50"
                    : "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted/70 border border-dashed border-muted-foreground/30"
                }
                title="Cliquer pour modifier la catégorie"
              >
                {catName ?? "catégorie ?"}
              </button>
            )}
            {(cluster.recurrence_pattern || cluster.is_recurring != null) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-muted-foreground bg-muted/60 dark:bg-muted/40" title="Récurrence">
                <Repeat2 className="w-3 h-3 opacity-70" />
                {cluster.recurrence_pattern ? formatRecurrence(cluster.recurrence_pattern) : cluster.is_recurring ? "Récurrent" : "Non récurrent"}
              </span>
            )}
            {cluster.statistics?.trend && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                  cluster.statistics.trend === "increasing"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400/90 dark:bg-amber-500/25"
                    : cluster.statistics.trend === "decreasing"
                      ? "bg-blue-500/15 text-blue-700 dark:text-blue-400/90 dark:bg-blue-500/25"
                      : "bg-muted/60 text-muted-foreground dark:bg-muted/40"
                }`}
                title="Tendance"
              >
                {cluster.statistics.trend === "increasing" ? (
                  <TrendingUp className="w-3 h-3" />
                ) : cluster.statistics.trend === "decreasing" ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {cluster.statistics.trend === "increasing" ? "Hausse" : cluster.statistics.trend === "decreasing" ? "Baisse" : "Stable"}
              </span>
            )}
          </div>
          </div>
        </div>
        <svg
          className={`w-4 h-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-6">
          {/* Stats */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Statistiques</h3>
              <Button
                variant="outline"
                size="sm"
                disabled={recomputing}
                isLoading={recomputing}
                onClick={handleRecompute}
              >
                Recalculer
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <StatItem label="Total" value={cluster.total_amount != null ? formatCurrency(cluster.total_amount) : "—"} />
              <StatItem label="Moyenne" value={cluster.avg_amount != null ? formatCurrency(cluster.avg_amount) : "—"} />
              <StatItem label="Min / Max" value={cluster.min_amount != null && cluster.max_amount != null ? `${formatCurrency(cluster.min_amount)} / ${formatCurrency(cluster.max_amount)}` : "—"} />
              <StatItem label="Écart-type" value={cluster.stddev_amount != null ? formatCurrency(cluster.stddev_amount) : "—"} />
              <StatItem label="Fréquence" value={cluster.avg_days_between != null ? `~${Math.round(cluster.avg_days_between)} j` : "—"} />
              <StatItem label="Récurrence" value={cluster.is_recurring ? (cluster.recurrence_pattern ?? "oui") : "non"} />
              <StatItem label="Période" value={cluster.first_date && cluster.last_date ? `${cluster.first_date} → ${cluster.last_date}` : "—"} />
              {cluster.statistics?.trend && (
                <StatItem label="Tendance" value={cluster.statistics.trend} />
              )}
            </div>
          </div>

          {/* Link to proposal */}
          {cluster.proposal_cluster_id != null && cluster.account_id != null && (
            <div>
              <Link
                to={`/classification?account_id=${cluster.account_id}`}
                className="text-sm text-primary hover:underline"
              >
                Voir dans la classification →
              </Link>
            </div>
          )}

          {/* Edit */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Informations</h3>
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Modifier
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving} isLoading={saving}>
                    Enregistrer
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Annuler
                  </Button>
                </div>
              )}
            </div>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Nom</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Description</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm mt-0.5 min-h-[60px]"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Catégorie</label>
                  <select
                    value={editCatId ?? ""}
                    onChange={(e) => setEditCatId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm mt-0.5"
                  >
                    <option value="">— Aucune —</option>
                    {flatCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {"\u00A0".repeat(c.depth)}{c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {cluster.description || "Pas de description."}
              </p>
            )}
          </div>

          <div className="rounded border bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <Settings className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {hasDetectionConfig ? (
                <>
                  <span className="text-muted-foreground">Détection :</span>
                  <code className="text-foreground font-medium truncate flex-1 min-w-0">
                    {cluster.rule_pattern || "—"}
                  </code>
                  <span className="text-muted-foreground shrink-0">({cluster.match_type || "contains"})</span>
                  <button
                    type="button"
                    onClick={openDetectionConfig}
                    className="ml-auto text-primary hover:underline text-[11px] shrink-0"
                  >
                    Modifier / Tester
                  </button>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">Aucune config de détection</span>
                  <button
                    type="button"
                    onClick={openDetectionConfig}
                    className="ml-auto text-primary hover:underline text-[11px] shrink-0"
                  >
                    Ajouter
                  </button>
                </>
              )}
            </div>
          </div>

          {detectionConfigOpen && (
            <DetectionConfigDialog
              cluster={cluster}
              onClose={() => setDetectionConfigOpen(false)}
              onSaved={onUpdated}
            />
          )}

          {/* Time series */}
          {timeSeriesData.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Série temporelle (montant par date)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSeriesData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), "Montant"]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Bar dataKey="amount" radius={2}>
                      {timeSeriesData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={timeSeriesData[i].amount >= 0 ? "#10b981" : "#ef4444"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Transactions */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <h3 className="text-sm font-medium">
                Transactions ({loadingTx ? "…" : transactions?.length ?? 0})
              </h3>
              {transactions && transactions.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      selection?.size === transactions.length
                        ? onSelectAll(cluster.id, [])
                        : onSelectAll(cluster.id, transactions.map((t) => t.id))
                    }
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {selection?.size === transactions.length ? "Tout désélectionner" : "Tout sélectionner"}
                  </button>
                  <Button
                    variant={clipBoard?.sourceClusterId === cluster.id ? "primary" : "outline"}
                    size="sm"
                    disabled={!selection?.size}
                    onClick={() => onCopy(cluster.id, cluster.name)}
                    title={
                      clipBoard?.sourceClusterId === cluster.id
                        ? `${clipBoard.transactionIds.length} transaction(s) copiée(s) — prêtes à coller ailleurs`
                        : "Copier les transactions sélectionnées pour les déplacer"
                    }
                    className={
                      clipBoard?.sourceClusterId === cluster.id
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : undefined
                    }
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copier ({selection?.size ?? 0})
                  </Button>
                  {clipBoard && clipBoard.sourceClusterId !== cluster.id && clipBoard.transactionIds.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPasteClick(cluster.id, cluster.name)}
                      title={`Coller ${clipBoard.transactionIds.length} transaction(s) depuis ${clipBoard.sourceClusterName}`}
                    >
                      <ClipboardPaste className="w-3.5 h-3.5 mr-1" />
                      Coller ({clipBoard.transactionIds.length})
                    </Button>
                  )}
                </div>
              )}
            </div>
            {loadingTx ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : transactions && transactions.length > 0 ? (
              <div className="max-h-60 overflow-y-auto rounded border bg-muted/20 p-2 space-y-0.5">
                {transactions.map((t) => {
                  const isSelected = selection?.has(t.id) ?? false;
                  const isInClipboard =
                    clipBoard?.sourceClusterId === cluster.id && clipBoard.transactionIds.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onToggleSelection(cluster.id, t.id)}
                      onKeyDown={(e) => e.key === "Enter" && onToggleSelection(cluster.id, t.id)}
                      className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded cursor-pointer select-none border-b border-border/50 last:border-0 transition-colors ${
                        isInClipboard
                          ? "bg-primary/20 dark:bg-primary/25 ring-1 ring-primary/40 shadow-sm animate-glow-pulse"
                          : isSelected
                            ? "bg-primary/15 dark:bg-primary/20 ring-1 ring-primary/30"
                            : "hover:bg-muted/40"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected || isInClipboard
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/50"
                        }`}
                      >
                        {(isSelected || isInClipboard) && (
                          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="text-muted-foreground shrink-0 w-20">{formatDate(t.date)}</span>
                      <span className="truncate flex-1 min-w-0">{t.label_raw}</span>
                      <span
                        className={`shrink-0 font-medium ${t.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {formatCurrency(t.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune transaction.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-background/50 px-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium truncate" title={value}>
        {value}
      </p>
    </div>
  );
}
