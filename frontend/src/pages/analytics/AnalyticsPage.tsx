import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Treemap,
} from "recharts";
import { TransactionFilters, type FilterState } from "../transactions/TransactionFilters";
import { EditTransactionModal, type EditTransactionPayload } from "../transactions/EditTransactionModal";
import { CategoryRuleModal, type CategoryRuleModalPayload } from "../transactions/CategoryRuleModal";
import {
  analyticsService,
  type CategoryBreakdown,
  type LabelGroup,
  type AnalyticsFilters,
} from "../../services/analytics.service";
import { transactionService } from "../../services/transaction.service";
import { accountService } from "../../services/account.service";
import { categoryService } from "../../services/category.service";
import { formatCurrency, formatDate } from "../../utils/format";
import type { Account } from "../../types/account.types";
import type { Category } from "../../types/category.types";

// ---------------------------------------------------------------------------
// Colour palette (12 distinct colours)
// ---------------------------------------------------------------------------
const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
  "#e11d48", "#84cc16",
];

function pickColor(idx: number): string {
  return COLORS[idx % COLORS.length];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [data, setData] = useState<CategoryBreakdown[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"bar" | "treemap">("bar");

  const [filters, setFilters] = useState<FilterState>({
    accountId: "",
    direction: "expense",
    categoryId: "",
    datePreset: "all",
    dateFrom: "",
    dateTo: "",
    search: "",
  });

  const fetchCategories = useCallback(() => {
    categoryService.list().then(setCategories).catch(() => {});
  }, []);

  // ── Reference data ─────────────────────────────────
  useEffect(() => {
    accountService.list().then(setAccounts).catch(() => {});
    fetchCategories();
  }, [fetchCategories]);

  // ── Fetch analytics ────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (filters.accountId) params.account_id = parseInt(filters.accountId);
      if (filters.dateFrom) params.date_from = filters.dateFrom;
      if (filters.dateTo) params.date_to = filters.dateTo;
      if (filters.direction) params.direction = filters.direction;

      const result = await analyticsService.byCategory(params);
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters.accountId, filters.dateFrom, filters.dateTo, filters.direction]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  // ── Derived data ───────────────────────────────────
  const grandTotal = useMemo(
    () => data.reduce((s, d) => s + Math.abs(d.total), 0),
    [data]
  );

  // ── KPIs ───────────────────────────────────────────
  const kpiCount = data.reduce((s, d) => s + d.count, 0);
  const kpiTotal = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analyses</h1>
          <p className="text-muted-foreground mt-1">Répartition par catégorie</p>
        </div>

        {/* View toggle */}
        <div className="flex rounded-md border border-input overflow-hidden">
          {[
            { val: "bar" as const, label: "Bar Chart" },
            { val: "treemap" as const, label: "Treemap" },
          ].map((opt) => (
            <button
              key={opt.val}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                view === opt.val
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted text-muted-foreground"
              }`}
              onClick={() => setView(opt.val)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters (reuse from Transactions) */}
      <TransactionFilters
        filters={filters}
        onChange={handleFilterChange}
        accounts={accounts}
        categories={categories}
        onCategoryDropdownOpen={fetchCategories}
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Catégories"
          value={String(data.length)}
          sub={`sur ${kpiCount} transactions`}
        />
        <KpiCard
          label="Total"
          value={formatCurrency(Math.abs(kpiTotal))}
          sub={kpiTotal >= 0 ? "revenus" : "dépenses"}
          color={kpiTotal >= 0 ? "text-emerald-600" : "text-red-600"}
        />
        <KpiCard
          label="Première catégorie"
          value={data.length > 0 ? data[0].category_name : "—"}
          sub={
            data.length > 0
              ? `${formatCurrency(Math.abs(data[0].total))} (${data[0].percentage}%)`
              : ""
          }
        />
      </div>

      {/* Chart area */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          Chargement...
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          Aucune donnée pour cette sélection.
        </div>
      ) : (
        <>
          {view === "bar" && <HorizontalBarChart data={data} />}
          {view === "treemap" && <CategoryTreemap data={data} grandTotal={grandTotal} />}

          {/* Detail table */}
          <DetailTable
            data={data}
            grandTotal={grandTotal}
            filters={filters}
            categories={categories}
            onRefresh={fetchData}
            onCategoryDropdownOpen={fetchCategories}
            onEditModalOpen={fetchCategories}
          />
        </>
      )}
    </div>
  );
}

// ===========================================================================
// KPI Card
// ===========================================================================

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ===========================================================================
// Horizontal Bar Chart
// ===========================================================================

function HorizontalBarChart({ data }: { data: CategoryBreakdown[] }) {
  const chartData = useMemo(
    () =>
      data.map((d, i) => ({
        name: d.parent_name
          ? `${d.parent_name} > ${d.category_name}`
          : d.category_name,
        value: Math.abs(d.total),
        rawTotal: d.total,
        count: d.count,
        percentage: d.percentage,
        fill: pickColor(i),
      })),
    [data]
  );

  const barHeight = 36;
  const chartHeight = Math.max(300, chartData.length * barHeight + 60);

  return (
    <div className="bg-card border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-4">Classement par montant</h3>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 60, bottom: 4, left: 10 }}
        >
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatCurrency(v)}
            fontSize={11}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={200}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: number, _name: string, item: any) => [
              formatCurrency(value),
              `${item.payload.count} transactions (${item.payload.percentage}%)`,
            ]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// Treemap
// ===========================================================================

interface TreemapContentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  value: number;
  fill: string;
  percentage: number;
}

function CustomTreemapContent(props: TreemapContentProps) {
  const { x, y, width, height, name, value, fill, percentage } = props;

  if (width < 30 || height < 20) return null;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="hsl(var(--background))"
        strokeWidth={2}
        rx={4}
        ry={4}
      />
      {width > 60 && height > 35 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 7}
            textAnchor="middle"
            fill="#fff"
            fontSize={width > 120 ? 13 : 11}
            fontWeight="600"
          >
            {name.length > Math.floor(width / 7)
              ? name.slice(0, Math.floor(width / 7)) + "…"
              : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.85)"
            fontSize={10}
          >
            {formatCurrency(value)} ({percentage}%)
          </text>
        </>
      )}
    </g>
  );
}

function CategoryTreemap({
  data,
  grandTotal,
}: {
  data: CategoryBreakdown[];
  grandTotal: number;
}) {
  // Group by parent (top-level categories)
  const treemapData = useMemo(() => {
    // Build parent groups
    const groups = new Map<
      string,
      { name: string; children: { name: string; value: number; fill: string; percentage: number }[] }
    >();

    data.forEach((d, idx) => {
      const parentKey = d.parent_name || d.category_name;
      const childName = d.parent_name ? d.category_name : d.category_name;

      if (!groups.has(parentKey)) {
        groups.set(parentKey, { name: parentKey, children: [] });
      }
      groups.get(parentKey)!.children.push({
        name: childName,
        value: Math.abs(d.total),
        fill: pickColor(idx),
        percentage: d.percentage,
      });
    });

    return Array.from(groups.values());
  }, [data]);

  // Flatten for Recharts Treemap (it wants a flat children array at top level)
  const flatData = useMemo(() => {
    const items: { name: string; value: number; fill: string; percentage: number }[] = [];
    for (const group of treemapData) {
      for (const child of group.children) {
        items.push(child);
      }
    }
    return items;
  }, [treemapData]);

  return (
    <div className="bg-card border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-4">Répartition visuelle (treemap)</h3>
      <ResponsiveContainer width="100%" height={420}>
        <Treemap
          data={flatData}
          dataKey="value"
          aspectRatio={4 / 3}
          stroke="hsl(var(--background))"
          content={<CustomTreemapContent x={0} y={0} width={0} height={0} name="" value={0} fill="" percentage={0} />}
        />
      </ResponsiveContainer>
    </div>
  );
}

// ===========================================================================
// Detail Table (expandable treeview)
// ===========================================================================

function DetailTable({
  data,
  grandTotal,
  filters,
  categories: rawCategories,
  onRefresh,
  onCategoryDropdownOpen,
  onEditModalOpen,
}: {
  data: CategoryBreakdown[];
  grandTotal: number;
  filters: FilterState;
  categories: Category[];
  onRefresh: () => void;
  onCategoryDropdownOpen?: () => void;
  onEditModalOpen?: () => void;
}) {
  const [expandedCatId, setExpandedCatId] = useState<number | null | "none">("none");
  const [detail, setDetail] = useState<LabelGroup[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Flat categories for dropdown
  const flatCategories = useMemo(() => {
    const flat: { id: number; name: string; depth: number }[] = [];
    const walk = (cats: Category[], depth: number) => {
      for (const cat of cats) {
        flat.push({ id: cat.id, name: cat.name, depth });
        if (cat.children?.length) walk(cat.children, depth + 1);
      }
    };
    walk(rawCategories, 0);
    return flat;
  }, [rawCategories]);

  const handleToggle = async (catId: number | null) => {
    const key = catId ?? null;
    if (expandedCatId === key) {
      setExpandedCatId("none");
      setDetail([]);
      return;
    }
    setExpandedCatId(key);
    setDetailLoading(true);
    try {
      const apiFilters: AnalyticsFilters = {};
      if (filters.accountId) apiFilters.account_id = parseInt(filters.accountId);
      if (filters.dateFrom) apiFilters.date_from = filters.dateFrom;
      if (filters.dateTo) apiFilters.date_to = filters.dateTo;
      if (filters.direction) apiFilters.direction = filters.direction as "income" | "expense";

      const result = await analyticsService.categoryDetail(catId, apiFilters);
      setDetail(result);
    } catch {
      setDetail([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCategoryChange = async (txnId: number, newCatId: number | null) => {
    try {
      await transactionService.update(txnId, {
        category_id: newCatId ?? undefined,
      });
      onRefresh();
      if (expandedCatId !== "none") {
        const catIdForRefresh = expandedCatId === null ? null : expandedCatId;
        const apiFilters: AnalyticsFilters = {};
        if (filters.accountId) apiFilters.account_id = parseInt(filters.accountId);
        if (filters.dateFrom) apiFilters.date_from = filters.dateFrom;
        if (filters.dateTo) apiFilters.date_to = filters.dateTo;
        if (filters.direction) apiFilters.direction = filters.direction as "income" | "expense";
        const result = await analyticsService.categoryDetail(catIdForRefresh, apiFilters);
        setDetail(result);
      }
    } catch {
      // ignore
    }
  };

  const [editTransaction, setEditTransaction] = useState<EditTransactionPayload | null>(null);
  const [ruleModalPayload, setRuleModalPayload] = useState<CategoryRuleModalPayload | null>(null);

  const openEditModal = useCallback(
    (payload: EditTransactionPayload) => {
      setEditTransaction(payload);
      onEditModalOpen?.();
    },
    [onEditModalOpen]
  );

  const handleCreateRule = async (
    txnId: number,
    categoryId: number,
    pattern: string,
    customLabel?: string,
  ) => {
    try {
      await transactionService.update(txnId, {
        category_id: categoryId,
        custom_label: customLabel,
        create_rule: true,
        rule_pattern: pattern,
      });
      onRefresh();
      if (expandedCatId !== "none") {
        const catIdForRefresh = expandedCatId === null ? null : expandedCatId;
        const apiFilters: AnalyticsFilters = {};
        if (filters.accountId) apiFilters.account_id = parseInt(filters.accountId);
        if (filters.dateFrom) apiFilters.date_from = filters.dateFrom;
        if (filters.dateTo) apiFilters.date_to = filters.dateTo;
        if (filters.direction) apiFilters.direction = filters.direction as "income" | "expense";
        const result = await analyticsService.categoryDetail(catIdForRefresh, apiFilters);
        setDetail(result);
      }
    } catch {
      // ignore
    }
    setRuleModalPayload(null);
  };

  const handleApplyOnly = async (txnId: number, categoryId: number, customLabel?: string) => {
    try {
      await transactionService.update(txnId, {
        category_id: categoryId,
        custom_label: customLabel,
        create_rule: false,
      });
      onRefresh();
      if (expandedCatId !== "none") {
        const catIdForRefresh = expandedCatId === null ? null : expandedCatId;
        const apiFilters: AnalyticsFilters = {};
        if (filters.accountId) apiFilters.account_id = parseInt(filters.accountId);
        if (filters.dateFrom) apiFilters.date_from = filters.dateFrom;
        if (filters.dateTo) apiFilters.date_to = filters.dateTo;
        if (filters.direction) apiFilters.direction = filters.direction as "income" | "expense";
        const result = await analyticsService.categoryDetail(catIdForRefresh, apiFilters);
        setDetail(result);
      }
    } catch {
      // ignore
    }
    setRuleModalPayload(null);
  };

  const handleEditSave = async (
    id: number,
    data: { label_clean?: string; category_id?: number | null; notes?: string | null },
  ) => {
    await transactionService.update(id, { ...data, create_rule: false });
    onRefresh();
    if (expandedCatId !== "none") {
      const catIdForRefresh = expandedCatId === null ? null : expandedCatId;
      const apiFilters: AnalyticsFilters = {};
      if (filters.accountId) apiFilters.account_id = parseInt(filters.accountId);
      if (filters.dateFrom) apiFilters.date_from = filters.dateFrom;
      if (filters.dateTo) apiFilters.date_to = filters.dateTo;
      if (filters.direction) apiFilters.direction = filters.direction as "income" | "expense";
      const result = await analyticsService.categoryDetail(catIdForRefresh, apiFilters);
      setDetail(result);
    }
    setEditTransaction(null);
  };

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left p-3 font-medium">Catégorie</th>
            <th className="text-right p-3 font-medium w-32">Montant</th>
            <th className="text-right p-3 font-medium w-20">Txns</th>
            <th className="text-right p-3 font-medium w-20">%</th>
            <th className="p-3 w-48">Répartition</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, idx) => {
            const pct = grandTotal > 0 ? (Math.abs(d.total) / grandTotal) * 100 : 0;
            const isExpanded = expandedCatId === (d.category_id ?? null);
            const isUncategorized = d.category_id === null;

            return (
              <>
                {/* Category row */}
                <tr
                  key={`cat-${d.category_id ?? "null"}`}
                  className={`border-b hover:bg-muted/20 transition-colors cursor-pointer ${
                    isExpanded ? "bg-muted/30" : ""
                  }`}
                  onClick={() => handleToggle(d.category_id)}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs w-4">
                        {isExpanded ? "▼" : "▶"}
                      </span>
                      <span
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: isUncategorized ? "#94a3b8" : pickColor(idx) }}
                      />
                      <span className={`font-medium ${isUncategorized ? "italic text-muted-foreground" : ""}`}>
                        {d.parent_name && (
                          <span className="text-muted-foreground font-normal">
                            {d.parent_name} &gt;{" "}
                          </span>
                        )}
                        {d.category_name}
                      </span>
                    </div>
                  </td>
                  <td className={`p-3 text-right font-semibold tabular-nums ${
                    d.total >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}>
                    {formatCurrency(d.total)}
                  </td>
                  <td className="p-3 text-right text-muted-foreground tabular-nums">
                    {d.count}
                  </td>
                  <td className="p-3 text-right text-muted-foreground tabular-nums">
                    {d.percentage}%
                  </td>
                  <td className="p-3">
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isUncategorized ? "#94a3b8" : pickColor(idx),
                        }}
                      />
                    </div>
                  </td>
                </tr>

                {/* Expanded detail rows */}
                {isExpanded && (
                  <tr key={`detail-${d.category_id ?? "null"}`}>
                    <td colSpan={5} className="p-0">
                      {detailLoading ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          Chargement des détails...
                        </div>
                      ) : detail.length === 0 ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          Aucune transaction.
                        </div>
                      ) : (
                        <div className="bg-muted/10 border-t">
                          {detail.map((grp) => (
                            <LabelGroupRow
                              key={grp.label}
                              group={grp}
                              flatCategories={flatCategories}
                              onCategoryChange={handleCategoryChange}
                              onEditTransaction={openEditModal}
                              onRequestRuleConfirm={setRuleModalPayload}
                              onCategoryDropdownOpen={onCategoryDropdownOpen}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/30 font-semibold">
            <td className="p-3">Total</td>
            <td className="p-3 text-right tabular-nums">
              {formatCurrency(data.reduce((s, d) => s + d.total, 0))}
            </td>
            <td className="p-3 text-right tabular-nums">
              {data.reduce((s, d) => s + d.count, 0)}
            </td>
            <td className="p-3 text-right tabular-nums">100%</td>
            <td className="p-3" />
          </tr>
        </tfoot>
      </table>

      <EditTransactionModal
        open={!!editTransaction}
        onClose={() => setEditTransaction(null)}
        transaction={editTransaction}
        flatCategories={flatCategories}
        onSave={handleEditSave}
        onCategoryDropdownOpen={onCategoryDropdownOpen}
      />

      <CategoryRuleModal
        open={!!ruleModalPayload}
        onClose={() => setRuleModalPayload(null)}
        payload={ruleModalPayload}
        onCreateRule={handleCreateRule}
        onApplyOnly={handleApplyOnly}
      />
    </div>
  );
}

// ===========================================================================
// Label Group Row (inside expanded category)
// ===========================================================================

function LabelGroupRow({
  group,
  flatCategories,
  onCategoryChange,
  onEditTransaction,
  onRequestRuleConfirm,
  onCategoryDropdownOpen,
}: {
  group: LabelGroup;
  flatCategories: { id: number; name: string; depth: number }[];
  onCategoryChange: (txnId: number, catId: number | null) => void;
  onEditTransaction: (txn: EditTransactionPayload) => void;
  onRequestRuleConfirm: (payload: CategoryRuleModalPayload) => void;
  onCategoryDropdownOpen?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-0">
      {/* Label header */}
      <div
        className="flex items-center gap-3 px-6 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted-foreground text-[10px] w-3">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="text-xs font-medium flex-1 truncate" title={group.label}>
          {group.label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {group.count} txn{group.count > 1 ? "s" : ""}
        </span>
        <span className={`text-xs font-semibold tabular-nums w-28 text-right ${
          group.total >= 0 ? "text-emerald-600" : "text-red-600"
        }`}>
          {formatCurrency(group.total)}
        </span>
      </div>

      {/* Individual transactions */}
      {expanded && (
        <div className="bg-background/50">
          {group.transactions.map((txn) => (
            <TransactionDetailRow
              key={txn.id}
              txn={txn}
              flatCategories={flatCategories}
              onCategoryChange={onCategoryChange}
              onEditTransaction={onEditTransaction}
              onRequestRuleConfirm={onRequestRuleConfirm}
              onCategoryDropdownOpen={onCategoryDropdownOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Transaction Detail Row (inside label group)
// ===========================================================================

function TransactionDetailRow({
  txn,
  flatCategories,
  onCategoryChange,
  onEditTransaction,
  onRequestRuleConfirm,
  onCategoryDropdownOpen,
}: {
  txn: { id: number; date: string; label_raw: string; label_clean: string | null; amount: number; currency: string; category_id: number | null; ai_confidence: string | null };
  flatCategories: { id: number; name: string; depth: number }[];
  onCategoryChange: (txnId: number, catId: number | null) => void;
  onEditTransaction: (txn: EditTransactionPayload) => void;
  onRequestRuleConfirm: (payload: CategoryRuleModalPayload) => void;
  onCategoryDropdownOpen?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pendingCatId, setPendingCatId] = useState<number | null>(null);
  const [customLabel, setCustomLabel] = useState("");

  const hasClean = txn.label_clean && txn.label_clean.trim() !== "" && txn.label_clean !== txn.label_raw;

  const handleDoubleClick = () => {
    onEditTransaction({
      id: txn.id,
      label_raw: txn.label_raw,
      label_clean: txn.label_clean,
      category_id: txn.category_id,
      notes: null,
      amount: txn.amount,
      currency: txn.currency,
      date: txn.date,
    });
  };

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
    <div
      className="flex items-center gap-3 px-10 py-1.5 text-xs hover:bg-muted/20 transition-colors border-t border-dashed border-muted cursor-pointer"
      onDoubleClick={handleDoubleClick}
      title="Double-clic pour modifier"
    >
      <span className="text-muted-foreground w-20 flex-shrink-0 tabular-nums">
        {formatDate(txn.date)}
      </span>
      <div className="flex-1 min-w-0">
        {hasClean ? (
          <>
            <span className="font-medium block truncate" title={txn.label_clean ?? undefined}>
              {txn.label_clean}
            </span>
            <span className="text-muted-foreground text-[11px] block truncate" title={txn.label_raw}>
              {txn.label_raw}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground truncate block" title={txn.label_raw}>
            {txn.label_raw}
          </span>
        )}
      </div>
      {/* Category reassignment — même flux que page Transactions : libellé + modale confirmation */}
      <span className="w-48 flex-shrink-0">
        {editing ? (
          <div className="space-y-1">
            <select
              autoFocus
              className="w-full rounded border border-input bg-background px-1 py-0.5 text-[11px]"
              value={pendingCatId ?? txn.category_id ?? ""}
              onChange={handleCatSelect}
              onFocus={() => onCategoryDropdownOpen?.()}
            >
              <option value="">— Aucune —</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {"\u00A0\u00A0".repeat(cat.depth)}{cat.name}
                </option>
              ))}
            </select>
            {pendingCatId != null && (
              <>
                <input
                  type="text"
                  placeholder="Libellé (ex: Salaire Serge)"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="w-full rounded border border-input bg-background px-1 py-0.5 text-[11px]"
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmCategory()}
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleConfirmCategory}
                    className="flex-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground hover:bg-primary/90"
                  >
                    OK
                  </button>
                  <button
                    type="button"
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
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-primary hover:underline truncate block w-full text-left"
            title="Changer la catégorie"
          >
            {txn.category_id
              ? flatCategories.find((c) => c.id === txn.category_id)?.name || `#${txn.category_id}`
              : "+ catégorie"}
          </button>
        )}
      </span>
      <span className={`w-24 text-right font-semibold tabular-nums flex-shrink-0 ${
        txn.amount >= 0 ? "text-emerald-600" : "text-red-600"
      }`}>
        {txn.amount >= 0 ? "+" : ""}{formatCurrency(txn.amount, txn.currency)}
      </span>
    </div>
  );
}
