/**
 * Query module — interactive dataviz with full data model access.
 *
 * Query: 2 modes (Formulaire UX / JSON) synced, with metamodel assistants.
 * Result: single panel with Graphique | JSON toggle, synchronized.
 *
 * Supports opening from AI chat via URL params: ?query=...&viz=... (base64 JSON)
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Play, Wallet, Check, ChevronDown, ChevronRight } from "lucide-react";
import { accountService } from "../../services/account.service";
import { queryService, type Metamodel, type MetamodelSource } from "../../services/query.service";
import type { Account } from "../../types/account.types";
import ChatChart from "../../components/chat/ChatChart";
import type { ChartResult } from "../../components/chat/ChatChart";
import QueryBuilder, { type QueryState } from "./QueryBuilder";

const DEFAULT_QUERY: QueryState = {
  source: "transactions",
  filters: [
    { field: "direction", op: "=", value: "expense" },
    { field: "date", op: "period", value: "last_12_months" },
  ],
  groupBy: ["month(date)", "category.name"],
  aggregates: [{ fn: "sum", field: "amount", as: "total" }],
  orderBy: [{ field: "month", dir: "asc" }],
};

const DEFAULT_VIZ = {
  chart: "area",
  title: "Répartition mensuelle des dépenses par catégorie",
  encoding: {
    x: { field: "month", type: "temporal" },
    y: { field: "total", type: "quantitative", format: "currency" },
    color: { field: "category_name", type: "nominal" },
  },
};

function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    const parsed = JSON.parse(str);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function MetamodelReadableView({ metamodel }: { metamodel: Metamodel }) {
  const sources = metamodel.sources || [];
  const temporalFns = metamodel.temporal_functions || [];
  const aggregateFns = metamodel.aggregate_functions || [];
  const filterOps = metamodel.filter_operators || [];
  const periodMacros = metamodel.period_macros || {};

  return (
    <div className="space-y-5 text-sm">
      {/* Sources */}
      <section>
        <h3 className="font-semibold text-foreground mb-2">Sources</h3>
        <div className="space-y-4">
          {sources.map((s: MetamodelSource) => (
            <div key={s.name} className="rounded border border-border/60 bg-background/50 p-3">
              <div className="font-medium text-foreground mb-0.5">{s.name}</div>
              {s.description && (
                <p className="text-muted-foreground mb-2 text-[11px]">{s.description}</p>
              )}
              <div className="space-y-1.5">
                {s.fields?.map((f: { name: string; type: string; description?: string; filterable?: boolean; aggregatable?: boolean }) => (
                  <div key={f.name} className="flex items-start gap-2 text-[11px]">
                    <code className="shrink-0 px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">
                      {f.name}
                    </code>
                    <span className="text-muted-foreground">({f.type})</span>
                    {f.description && (
                      <span className="text-muted-foreground">— {f.description}</span>
                    )}
                    {(f.aggregatable || f.filterable) && (
                      <span className="text-muted-foreground text-[10px]">
                        {[f.filterable && "filtrable", f.aggregatable && "agrégable"].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {s.relations && s.relations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/40">
                  <span className="text-muted-foreground text-[10px]">Relations : </span>
                  {s.relations.map((r: { target: string; description?: string }) => (
                    <span key={r.target} className="inline-flex items-center gap-1 mr-2">
                      <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">→ {r.target}</code>
                      {r.description && <span className="text-muted-foreground text-[10px]">({r.description})</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Fonctions temporelles */}
      <section>
        <h3 className="font-semibold text-foreground mb-1.5">Fonctions temporelles</h3>
        <p className="text-muted-foreground text-[11px] mb-1">Pour groupBy : month(date), quarter(date), year(date), etc.</p>
        <div className="flex flex-wrap gap-1.5">
          {temporalFns.map((fn: string) => (
            <code key={fn} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">{fn}</code>
          ))}
        </div>
      </section>

      {/* Fonctions d'agrégation */}
      <section>
        <h3 className="font-semibold text-foreground mb-1.5">Fonctions d'agrégation</h3>
        <div className="flex flex-wrap gap-1.5">
          {aggregateFns.map((fn: string) => (
            <code key={fn} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">{fn}</code>
          ))}
        </div>
      </section>

      {/* Opérateurs de filtre */}
      <section>
        <h3 className="font-semibold text-foreground mb-1.5">Opérateurs de filtre</h3>
        <div className="flex flex-wrap gap-1.5">
          {filterOps.map((op: string) => (
            <code key={op} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">{op}</code>
          ))}
        </div>
      </section>

      {/* Macros de période */}
      <section>
        <h3 className="font-semibold text-foreground mb-1.5">Macros de période</h3>
        <p className="text-muted-foreground text-[11px] mb-2">Pour op: &quot;period&quot;, value: &quot;nom_macro&quot;</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {Object.entries(periodMacros).map(([key, desc]) => (
            <div key={key} className="flex gap-2 text-[11px]">
              <code className="shrink-0 px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">{key}</code>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function QueryPage() {
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [queryMode, setQueryMode] = useState<"ux" | "json">("ux");
  const [queryObject, setQueryObject] = useState<QueryState>(() => {
    const q = searchParams.get("query");
    if (q) {
      try {
        const decoded = atob(q);
        return safeJsonParse(decoded, DEFAULT_QUERY) as QueryState;
      } catch {
        return DEFAULT_QUERY;
      }
    }
    return DEFAULT_QUERY;
  });
  const [vizJson, setVizJson] = useState(() => {
    const v = searchParams.get("viz");
    if (v) {
      try {
        const decoded = atob(v);
        return JSON.stringify(safeJsonParse(decoded, DEFAULT_VIZ), null, 2);
      } catch {
        return JSON.stringify(DEFAULT_VIZ, null, 2);
      }
    }
    return JSON.stringify(DEFAULT_VIZ, null, 2);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartResult, setChartResult] = useState<ChartResult | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaViewMode, setSchemaViewMode] = useState<"json" | "lisible">("lisible");
  const [metamodel, setMetamodel] = useState<Metamodel | null>(null);
  const [resultViewMode, setResultViewMode] = useState<"graphique" | "json">("graphique");

  useEffect(() => {
    accountService.list().then((data) => {
      setAccounts(data);
      setSelectedAccountIds(data.map((a) => a.id));
    });
  }, []);

  useEffect(() => {
    if (!metamodel) {
      queryService.getMetamodel().then(setMetamodel);
    }
  }, [metamodel]);

  // Sync vizJson from chartResult when we get a new result (so JSON view shows the exact viz used)
  useEffect(() => {
    if (chartResult) {
      setVizJson(JSON.stringify(chartResult.viz, null, 2));
    }
  }, [chartResult]);

  const runQuery = useCallback(async () => {
    const query = queryObject as Record<string, unknown>;
    const viz = safeJsonParse(vizJson, DEFAULT_VIZ);
    if (!query.source || !viz.chart) {
      setError("Query doit avoir 'source', viz doit avoir 'chart'");
      return;
    }
    setLoading(true);
    setError(null);
    setChartResult(null);
    try {
      const res = await queryService.execute({
        query,
        viz,
        account_ids: selectedAccountIds.length === accounts.length ? undefined : selectedAccountIds,
      });
      if (res.trace.error) {
        setError(res.trace.error);
      }
      setChartResult(queryService.toChartResult(res));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'exécution");
    } finally {
      setLoading(false);
    }
  }, [queryObject, vizJson, selectedAccountIds, accounts.length]);

  const toggleAccount = (id: number) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const toggleAllAccounts = () => {
    setSelectedAccountIds((prev) =>
      prev.length === accounts.length ? [] : accounts.map((a) => a.id)
    );
  };

  const accountScopeLabel =
    selectedAccountIds.length === 0
      ? "Aucun compte"
      : selectedAccountIds.length === accounts.length
        ? "Tous les comptes"
        : `${selectedAccountIds.length} compte${selectedAccountIds.length > 1 ? "s" : ""}`;

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-xl font-semibold">Query — Analyse interactive</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border hover:bg-muted transition-colors"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{accountScopeLabel}</span>
            </button>
            {accountMenuOpen && accounts.length > 0 && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setAccountMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 top-full mt-1 w-56 bg-background border rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={toggleAllAccounts}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                        selectedAccountIds.length === accounts.length ? "bg-primary border-primary" : ""
                      }`}
                    >
                      {selectedAccountIds.length === accounts.length && (
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      )}
                    </span>
                    <span className="font-medium">Tous les comptes</span>
                  </button>
                  <div className="border-t my-1" />
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => toggleAccount(acc.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                          selectedAccountIds.includes(acc.id) ? "bg-primary border-primary" : ""
                        }`}
                      >
                        {selectedAccountIds.includes(acc.id) && (
                          <Check className="w-2.5 h-2.5 text-primary-foreground" />
                        )}
                      </span>
                      <span className="truncate">{acc.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={runQuery}
            disabled={loading || selectedAccountIds.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <Play className="w-4 h-4" />
            )}
            Exécuter
          </button>
        </div>
      </div>

      {/* Schema toggle */}
      <button
        onClick={() => setSchemaOpen((o) => !o)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
      >
        {schemaOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Modèle de données (sources, champs, opérateurs)
      </button>
      {schemaOpen && metamodel && (
        <div className="mb-4 rounded-lg border bg-muted/20 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">Format</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSchemaViewMode("lisible")}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  schemaViewMode === "lisible" ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
                }`}
              >
                Lisible
              </button>
              <button
                type="button"
                onClick={() => setSchemaViewMode("json")}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  schemaViewMode === "json" ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
                }`}
              >
                JSON
              </button>
            </div>
          </div>
          <div className="p-4 text-xs overflow-x-auto max-h-64 overflow-y-auto">
            {schemaViewMode === "json" ? (
              <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(metamodel, null, 2)}</pre>
            ) : (
              <MetamodelReadableView metamodel={metamodel} />
            )}
          </div>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Left: Query only */}
        <div className="flex flex-col min-h-0">
          <div className="flex-1 flex flex-col min-h-0 rounded-lg border overflow-hidden">
            <QueryBuilder
              query={queryObject}
              onChange={setQueryObject}
              metamodel={metamodel}
              mode={queryMode}
              onModeChange={setQueryMode}
            />
          </div>
        </div>

        {/* Right: Result — Graphique + JSON merged, synchronized */}
        <div className="flex flex-col min-h-0 rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <span className="text-sm font-medium">Résultat</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setResultViewMode("graphique")}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  resultViewMode === "graphique" ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
                }`}
              >
                Graphique
              </button>
              <button
                type="button"
                onClick={() => setResultViewMode("json")}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  resultViewMode === "json" ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
                }`}
              >
                JSON
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}
            {loading ? (
              <p className="text-sm text-muted-foreground">Exécution en cours...</p>
            ) : resultViewMode === "graphique" ? (
              chartResult && chartResult.data.length > 0 ? (
                <ChatChart
                  chart={{
                    ...chartResult,
                    viz: safeJsonParse(vizJson, chartResult.viz),
                  }}
                  onVizChange={(viz) => setVizJson(JSON.stringify(viz, null, 2))}
                />
              ) : chartResult && chartResult.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune donnée retournée.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Définissez la query et la viz, puis cliquez sur Exécuter.
                </p>
              )
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Viz (config)</label>
                  <textarea
                    value={vizJson}
                    onChange={(e) => setVizJson(e.target.value)}
                    className="w-full min-h-[140px] p-3 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder='{"chart": "bar", "encoding": {...}}'
                    spellCheck={false}
                  />
                </div>
                {chartResult && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Données ({chartResult.data.length} ligne{chartResult.data.length > 1 ? "s" : ""})
                    </label>
                    <pre className="p-3 text-xs font-mono bg-muted/30 rounded border overflow-x-auto max-h-[300px] overflow-y-auto">
                      {JSON.stringify(chartResult.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
