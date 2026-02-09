import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { ImportModal } from "./ImportModal";
import { CashflowChart, type ChartGranularity } from "./CashflowChart";
import { TransactionKPIs } from "./TransactionKPIs";
import { TransactionFilters, type FilterState } from "./TransactionFilters";
import { CategoryRuleModal, type CategoryRuleModalPayload } from "./CategoryRuleModal";
import { EditTransactionModal, type EditTransactionPayload } from "./EditTransactionModal";
import { ClusterReviewModal } from "./ClusterReviewModal";
import { transactionService } from "../../services/transaction.service";
import { accountService } from "../../services/account.service";
import { categoryService } from "../../services/category.service";
import { formatCurrency, formatDate } from "../../utils/format";
import type { Transaction, PaginatedTransactions, CashflowMonthly, CashflowDaily, ClustersResponse } from "../../types/transaction.types";
import type { Account } from "../../types/account.types";
import type { Category } from "../../types/category.types";

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: string;
  label: string;
  sortKey?: string;        // backend field name for sorting
  align?: "left" | "right";
  defaultWidth: number;
  minWidth: number;
  hiddenBelow?: number;   // hide below this viewport width (not used with resize)
}

const COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date", sortKey: "date", defaultWidth: 100, minWidth: 80 },
  { key: "label", label: "Libellé", sortKey: "label_raw", defaultWidth: 420, minWidth: 150 },
  { key: "account", label: "Compte", defaultWidth: 140, minWidth: 80 },
  { key: "category", label: "Catégorie", sortKey: "category_id", defaultWidth: 150, minWidth: 80 },
  { key: "amount", label: "Montant", sortKey: "amount", align: "right", defaultWidth: 120, minWidth: 80 },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TransactionsPage() {
  // Data
  const [data, setData] = useState<PaginatedTransactions | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cashflowMonthly, setCashflowMonthly] = useState<CashflowMonthly[]>([]);
  const [cashflowDaily, setCashflowDaily] = useState<CashflowDaily[]>([]);
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Pagination & sort
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filters
  const [filters, setFilters] = useState<FilterState>({
    accountId: "",
    direction: "",
    categoryId: "",
    datePreset: "all",
    dateFrom: "",
    dateTo: "",
    search: "",
  });

  // Cluster review (distance_threshold: lower = more selective, higher = more grouping)
  const CLUSTER_SENSITIVITY_OPTIONS = [
    { value: 0.1, label: "Super exigeant" },
    { value: 0.14, label: "Très exigeant" },
    { value: 0.18, label: "Exigeant" },
    { value: 0.22, label: "Très sélectif" },
    { value: 0.28, label: "Sélectif" },
    { value: 0.36, label: "Normal" },
    { value: 0.48, label: "Large" },
  ] as const;
  const [clusterLoading, setClusterLoading] = useState(false);
  const [clustersData, setClustersData] = useState<ClustersResponse | null>(null);
  const [clusterDistanceThreshold, setClusterDistanceThreshold] = useState(0.22);

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(filters.search);
      setPage(1);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [filters.search]);

  // Column widths (resizable)
  const [colWidths, setColWidths] = useState<number[]>(COLUMNS.map((c) => c.defaultWidth));

  const fetchCategories = useCallback(() => {
    categoryService.list().then(setCategories).catch(() => {});
  }, []);

  // Fetch reference data
  useEffect(() => {
    accountService.list().then(setAccounts).catch(() => {});
    fetchCategories();
  }, [fetchCategories]);

  // Fetch cashflow (both granularities for instant toggle)
  const accountIdNum = filters.accountId ? parseInt(filters.accountId) : undefined;

  const fetchCashflow = useCallback(async () => {
    try {
      const [monthly, daily] = await Promise.all([
        transactionService.getCashflowMonthly(accountIdNum),
        transactionService.getCashflowDaily(accountIdNum),
      ]);
      setCashflowMonthly(monthly);
      setCashflowDaily(daily);
    } catch {
      // ignore — chart just won't show
    }
  }, [accountIdNum]);

  useEffect(() => {
    fetchCashflow();
  }, [fetchCashflow]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      // Build filter params
      const params: Record<string, any> = {
        page,
        per_page: 50,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (filters.accountId) params.account_id = parseInt(filters.accountId);
      if (filters.categoryId) params.category_id = parseInt(filters.categoryId);
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      if (debouncedSearch) params.search = debouncedSearch;

      // Direction filter: use amount_min / amount_max
      if (filters.direction === "income") {
        params.amount_min = 0.01;
      } else if (filters.direction === "expense") {
        params.amount_max = -0.01;
      }

      const result = await transactionService.list(params);
      setData(result);
      setError(null);
    } catch {
      setError("Impossible de charger les transactions.");
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, filters.accountId, filters.categoryId, filters.dateFrom, filters.dateTo, filters.direction, debouncedSearch]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Handlers
  const handleFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const handleSort = useCallback(
    (key: string) => {
      const col = COLUMNS.find((c) => c.key === key);
      if (!col?.sortKey) return;
      if (sortBy === col.sortKey) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(col.sortKey);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sortBy]
  );

  const handleChartRange = useCallback(
    (from: string | null, to: string | null) => {
      if (!from && !to) {
        setFilters((prev) => ({ ...prev, datePreset: "all", dateFrom: "", dateTo: "" }));
      } else {
        setFilters((prev) => ({
          ...prev,
          datePreset: "range",
          dateFrom: from || "",
          dateTo: to || "",
        }));
      }
      setPage(1);
    },
    []
  );

  const handleImportClose = useCallback(
    (refreshNeeded: boolean) => {
      setImportOpen(false);
      if (refreshNeeded) {
        setPage(1);
        fetchTransactions();
        fetchCashflow();
      }
    },
    [fetchTransactions, fetchCashflow]
  );

  const handleShowClusters = useCallback(async () => {
    try {
      setClusterLoading(true);
      setError(null);
      const accountIdParam = filters.accountId ? parseInt(filters.accountId) : undefined;
      // Step 1: parse labels for transactions missing metadata
      await transactionService.parseLabels(accountIdParam);
      // Step 2: compute missing embeddings (uses cleaned counterparty)
      await transactionService.computeEmbeddings(accountIdParam);
      // Step 3: fetch clusters with suggestions
      const result = await transactionService.getClusters(
        accountIdParam,
        undefined,
        clusterDistanceThreshold
      );
      if (result.total_uncategorized === 0) {
        setError("Toutes les transactions sont deja classees.");
      } else {
        setClustersData(result);
      }
    } catch {
      setError("Erreur lors du calcul des suggestions.");
    } finally {
      setClusterLoading(false);
    }
  }, [filters.accountId, clusterDistanceThreshold]);

  const handleClusterClose = useCallback(
    (refreshNeeded: boolean) => {
      setClustersData(null);
      if (refreshNeeded) {
        fetchTransactions();
        fetchCashflow();
      }
    },
    [fetchTransactions, fetchCashflow]
  );

  // Build flat category list for the dropdown (must be before handleCategoryChange)
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

  // Modal: confirm rule creation or apply only
  const [ruleModalPayload, setRuleModalPayload] = useState<CategoryRuleModalPayload | null>(null);
  // Modal: edit transaction (double-click)
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);

  // Rafraîchir les catégories à l’ouverture du modal d’édition (liste à jour dans le select)
  useEffect(() => {
    if (editTransaction) fetchCategories();
  }, [editTransaction, fetchCategories]);

  const handleCategoryChange = useCallback(
    async (txnId: number, categoryId: number | null, customLabel?: string) => {
      try {
        const result = await transactionService.update(txnId, {
          category_id: categoryId ?? undefined,
          custom_label: customLabel,
        });
        if (result.rule_applied_count && result.rule_applied_count > 0) {
          fetchTransactions();
          fetchCashflow();
        } else {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              data: prev.data.map((t) => {
                if (t.id !== txnId) return t;
                const cat = flatCategories.find((c) => c.id === categoryId);
                return {
                  ...t,
                  category_id: categoryId,
                  category_name: cat?.name ?? null,
                  label_clean: customLabel || t.label_clean,
                  ai_confidence: "user",
                };
              }),
            };
          });
        }
      } catch {
        setError("Erreur lors de la mise à jour de la catégorie.");
      }
    },
    [flatCategories, fetchTransactions, fetchCashflow]
  );

  const handleCreateRule = useCallback(
    async (txnId: number, categoryId: number, pattern: string, customLabel?: string) => {
      try {
        const result = await transactionService.update(txnId, {
          category_id: categoryId,
          custom_label: customLabel,
          create_rule: true,
          rule_pattern: pattern,
        });
        if (result.rule_applied_count && result.rule_applied_count > 0) {
          fetchTransactions();
          fetchCashflow();
        } else {
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              data: prev.data.map((t) => {
                if (t.id !== txnId) return t;
                const cat = flatCategories.find((c) => c.id === categoryId);
                return {
                  ...t,
                  category_id: categoryId,
                  category_name: cat?.name ?? null,
                  label_clean: customLabel || t.label_clean,
                  ai_confidence: "user",
                };
              }),
            };
          });
        }
      } catch {
        setError("Erreur lors de la création de la règle.");
      }
    },
    [flatCategories, fetchTransactions, fetchCashflow]
  );

  const handleApplyOnly = useCallback(
    async (txnId: number, categoryId: number, customLabel?: string) => {
      try {
        await transactionService.update(txnId, {
          category_id: categoryId,
          custom_label: customLabel,
          create_rule: false,
        });
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: prev.data.map((t) => {
              if (t.id !== txnId) return t;
              const cat = flatCategories.find((c) => c.id === categoryId);
              return {
                ...t,
                category_id: categoryId,
                category_name: cat?.name ?? null,
                label_clean: customLabel || t.label_clean,
                ai_confidence: "user",
              };
            }),
          };
        });
      } catch {
        setError("Erreur lors de la mise à jour.");
      }
    },
    [flatCategories]
  );

  const handleEditTransactionSave = useCallback(
    async (
      id: number,
      data: { label_clean?: string; category_id?: number | null; notes?: string | null },
    ) => {
      await transactionService.update(id, {
        ...data,
        create_rule: false,
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((t) => {
            if (t.id !== id) return t;
            const cat = data.category_id != null ? flatCategories.find((c) => c.id === data.category_id) : null;
            return {
              ...t,
              label_clean: data.label_clean ?? t.label_clean,
              category_id: data.category_id ?? t.category_id,
              category_name: cat?.name ?? (data.category_id != null ? null : t.category_name),
              notes: data.notes ?? t.notes,
            };
          }),
        };
      });
    },
    [flatCategories]
  );

  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Regroupement :</span>
            <select
              value={clusterDistanceThreshold}
              onChange={(e) => setClusterDistanceThreshold(Number(e.target.value))}
              className="text-xs rounded border border-input bg-background px-2 py-1.5"
              title="Plus sélectif = clusters plus homogènes, moins de regroupements hasardeux"
            >
              {CLUSTER_SENSITIVITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={handleShowClusters} disabled={clusterLoading}>
            {clusterLoading ? (
              <>
                <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyse...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Suggestions
              </>
            )}
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Importer
          </Button>
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* KPIs — always reflect current filter selection */}
      <TransactionKPIs
        filteredCount={data?.meta.total ?? 0}
        filteredIncome={data?.meta.total_income ?? 0}
        filteredExpenses={data?.meta.total_expenses ?? 0}
        filteredNet={data?.meta.total_net ?? 0}
      />

      {/* Cashflow chart */}
      <CashflowChart
        monthlyData={cashflowMonthly}
        dailyData={cashflowDaily}
        granularity={chartGranularity}
        onGranularityChange={setChartGranularity}
        onRangeSelect={handleChartRange}
        selectedRange={{ from: filters.dateFrom || null, to: filters.dateTo || null }}
      />

      {/* Filters */}
      <TransactionFilters
        filters={filters}
        onChange={handleFilterChange}
        accounts={accounts}
        categories={categories}
        onCategoryDropdownOpen={fetchCategories}
      />

      {/* Transaction table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ tableLayout: "fixed", minWidth: colWidths.reduce((a, b) => a + b, 0) }}>
            <thead>
              <tr className="border-b bg-muted/50">
                {COLUMNS.map((col, i) => (
                  <ResizableHeader
                    key={col.key}
                    col={col}
                    width={colWidths[i]}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={() => handleSort(col.key)}
                    onResize={(w) =>
                      setColWidths((prev) => {
                        const next = [...prev];
                        next[i] = Math.max(col.minWidth, w);
                        return next;
                      })
                    }
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="p-8 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Chargement...
                    </div>
                  </td>
                </tr>
              ) : !data || data.data.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="p-8 text-center text-muted-foreground">
                    {accounts.length === 0
                      ? "Créez un compte bancaire, puis importez vos transactions."
                      : "Aucune transaction trouvée."}
                  </td>
                </tr>
              ) : (
                data.data.map((txn) => (
                  <TransactionRow
                    key={txn.id}
                    txn={txn}
                    accountName={accountMap[txn.account_id]?.name}
                    colWidths={colWidths}
                    flatCategories={flatCategories}
                    onCategoryChange={handleCategoryChange}
                    onRequestRuleConfirm={setRuleModalPayload}
                    onEditTransaction={setEditTransaction}
                    onCategoryDropdownOpen={fetchCategories}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.meta.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Page {data.meta.page} / {data.meta.pages} — {data.meta.total} résultats
            </p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>
                &#171;
              </Button>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.meta.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.meta.pages}
                onClick={() => setPage(data.meta.pages)}
              >
                &#187;
              </Button>
            </div>
          </div>
        )}
      </div>

      {importOpen && <ImportModal accounts={accounts} onClose={handleImportClose} />}

      <CategoryRuleModal
        open={!!ruleModalPayload}
        onClose={() => setRuleModalPayload(null)}
        payload={ruleModalPayload}
        onCreateRule={handleCreateRule}
        onApplyOnly={handleApplyOnly}
      />

      <EditTransactionModal
        open={!!editTransaction}
        onClose={() => setEditTransaction(null)}
        transaction={editTransaction}
        flatCategories={flatCategories}
        onSave={handleEditTransactionSave}
        onCategoryDropdownOpen={fetchCategories}
      />

      {clustersData && (
        <ClusterReviewModal
          clusters={clustersData}
          flatCategories={flatCategories}
          onClose={handleClusterClose}
          onCategoryDropdownOpen={fetchCategories}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resizable column header
// ---------------------------------------------------------------------------

function ResizableHeader({
  col,
  width,
  sortBy,
  sortOrder,
  onSort,
  onResize,
}: {
  col: ColumnDef;
  width: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: () => void;
  onResize: (width: number) => void;
}) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startXRef.current;
      onResize(startWidthRef.current + delta);
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const isSorted = col.sortKey && sortBy === col.sortKey;

  return (
    <th
      ref={thRef}
      className={`relative p-2 text-xs font-medium text-muted-foreground select-none ${
        col.align === "right" ? "text-right" : "text-left"
      } ${col.sortKey ? "cursor-pointer hover:text-foreground" : ""}`}
      style={{ width }}
      onClick={col.sortKey ? onSort : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {col.label}
        {isSorted && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sortOrder === "asc" ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            )}
          </svg>
        )}
        {col.sortKey && !isSorted && (
          <svg className="w-3 h-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        )}
      </span>
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 z-10"
        onMouseDown={handleMouseDown}
      />
    </th>
  );
}

// ---------------------------------------------------------------------------
// Transaction row
// ---------------------------------------------------------------------------

const PAYMENT_MODE_SHORT: Record<string, string> = {
  card: "CB",
  transfer: "VIR",
  transfer_in: "VIR",
  direct_debit: "PRLV",
  atm: "DAB",
  check: "CHQ",
  check_deposit: "CHQ",
  fee: "FRAIS",
  subscription: "ABO",
  refund: "REMB",
  credit: "AVOIR",
};

const CONFIDENCE_BADGE: Record<string, { label: string; className: string }> = {
  high: { label: "IA", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  medium: { label: "IA", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  low: { label: "IA?", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  embedding: { label: "E", className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400" },
  user: { label: "", className: "" },
};

function TransactionRow({
  txn,
  accountName,
  colWidths,
  flatCategories,
  onCategoryChange,
  onRequestRuleConfirm,
  onEditTransaction,
  onCategoryDropdownOpen,
}: {
  txn: Transaction;
  accountName?: string;
  colWidths: number[];
  flatCategories: { id: number; name: string; parentName: string | null; depth: number }[];
  onCategoryChange: (txnId: number, categoryId: number | null, customLabel?: string) => void;
  onRequestRuleConfirm: (payload: CategoryRuleModalPayload) => void;
  onEditTransaction: (txn: Transaction) => void;
  onCategoryDropdownOpen?: () => void;
}) {
  const isCredit = txn.amount >= 0;
  const [editing, setEditing] = useState(false);
  const [pendingCatId, setPendingCatId] = useState<number | null>(null);
  const [customLabel, setCustomLabel] = useState("");

  const confidence = txn.ai_confidence && CONFIDENCE_BADGE[txn.ai_confidence]?.label
    ? CONFIDENCE_BADGE[txn.ai_confidence]
    : null;

  const ruleConfidence = txn.ai_confidence === "rule"
    ? { label: "R", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" }
    : null;

  const handleCatSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? parseInt(e.target.value) : null;
    if (val) {
      setPendingCatId(val);
    } else {
      onCategoryChange(txn.id, null);
      setEditing(false);
    }
  };

  const handleConfirmCategory = () => {
    if (pendingCatId) {
      const categoryName = flatCategories.find((c) => c.id === pendingCatId)?.name ?? "";
      onRequestRuleConfirm({
        txnId: txn.id,
        categoryId: pendingCatId,
        categoryName,
        labelRaw: txn.label_raw,
        customLabel,
      });
    }
    setEditing(false);
    setPendingCatId(null);
    setCustomLabel("");
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setPendingCatId(null);
    setCustomLabel("");
  };

  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/30 transition-colors group cursor-pointer"
      onDoubleClick={() => onEditTransaction(txn)}
      title="Double-clic pour modifier"
    >
      {/* Date */}
      <td className="p-2 text-sm whitespace-nowrap" style={{ width: colWidths[0] }}>
        {formatDate(txn.date)}
      </td>
      {/* Label — with parsed metadata */}
      <td className="p-2" style={{ width: colWidths[1] }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {txn.parsed_metadata?.payment_mode && (
            <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 shrink-0">
              {PAYMENT_MODE_SHORT[txn.parsed_metadata.payment_type ?? ""] ?? txn.parsed_metadata.payment_mode}
            </span>
          )}
          <span className="text-sm font-medium break-words whitespace-pre-wrap leading-snug">
            {txn.label_clean || txn.parsed_metadata?.counterparty || txn.label_raw}
          </span>
          {txn.parsed_metadata?.card_id && (
            <span className="inline-flex items-center rounded px-1 py-0 text-[10px] text-muted-foreground bg-muted shrink-0">
              {txn.parsed_metadata.card_id.slice(-4)}
            </span>
          )}
        </div>
        {(txn.label_clean || txn.parsed_metadata?.counterparty) && (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{txn.label_raw}</p>
        )}
        {txn.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{txn.notes}</p>
        )}
      </td>
      {/* Account */}
      <td className="p-2 text-sm text-muted-foreground truncate" style={{ width: colWidths[2] }}>
        {accountName || "-"}
      </td>
      {/* Category — inline editable */}
      <td className="p-2 text-sm" style={{ width: colWidths[3] }}>
        {editing ? (
          <div className="space-y-1">
            <select
              autoFocus
              className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-xs"
              value={pendingCatId ?? txn.category_id ?? ""}
              onChange={handleCatSelect}
              onFocus={() => onCategoryDropdownOpen?.()}
            >
              <option value="">— Aucune —</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.depth > 0 ? "\u00A0\u00A0".repeat(cat.depth) : ""}
                  {cat.name}
                </option>
              ))}
            </select>
            {pendingCatId && (
              <>
                <input
                  type="text"
                  placeholder="Libellé (ex: Salaire Serge)"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmCategory()}
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleConfirmCategory}
                    className="flex-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground hover:bg-primary/90"
                  >
                    OK
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                  >
                    Annuler
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <span
            className="inline-flex items-center gap-1 cursor-pointer group/cat"
            onClick={() => setEditing(true)}
            title="Cliquer pour changer la catégorie"
          >
            {txn.category_name ? (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                {txn.category_name}
              </span>
            ) : (
              <span className="text-muted-foreground text-xs hover:text-foreground transition-colors">
                + catégorie
              </span>
            )}
            {confidence && (
              <span className={`inline-flex items-center rounded px-1 py-0 text-[10px] font-medium ${confidence.className}`}>
                {confidence.label}
              </span>
            )}
            {ruleConfidence && (
              <span className={`inline-flex items-center rounded px-1 py-0 text-[10px] font-medium ${ruleConfidence.className}`}>
                {ruleConfidence.label}
              </span>
            )}
          </span>
        )}
      </td>
      {/* Amount */}
      <td
        className={`p-2 text-sm font-semibold text-right whitespace-nowrap ${
          isCredit ? "text-emerald-600" : "text-red-600"
        }`}
        style={{ width: colWidths[4] }}
      >
        {isCredit ? "+" : ""}
        {formatCurrency(txn.amount, txn.currency)}
      </td>
    </tr>
  );
}
