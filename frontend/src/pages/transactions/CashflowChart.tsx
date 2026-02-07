import { useMemo, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
  Legend,
} from "recharts";
import type { CashflowMonthly, CashflowDaily } from "../../types/transaction.types";
import { formatCurrency } from "../../utils/format";

export type ChartGranularity = "monthly" | "daily";

interface CashflowChartProps {
  monthlyData: CashflowMonthly[];
  dailyData: CashflowDaily[];
  granularity: ChartGranularity;
  onGranularityChange: (g: ChartGranularity) => void;
  onRangeSelect: (dateFrom: string | null, dateTo: string | null) => void;
  selectedRange: { from: string | null; to: string | null };
}

export function CashflowChart({
  monthlyData,
  dailyData,
  granularity,
  onGranularityChange,
  onRangeSelect,
  selectedRange,
}: CashflowChartProps) {
  const [collapsed, setCollapsed] = useState(false);

  const hasData = granularity === "monthly" ? monthlyData.length > 0 : dailyData.length > 0;

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-sm font-semibold">Cashflow</h3>
          </div>

          {/* Granularity toggle */}
          {!collapsed && (
            <div
              className="flex rounded-md border border-input overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {(["monthly", "daily"] as const).map((g) => (
                <button
                  key={g}
                  className={`px-2.5 h-6 text-xs transition-colors ${
                    granularity === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                  onClick={() => onGranularityChange(g)}
                >
                  {g === "monthly" ? "Mensuel" : "Journalier"}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedRange.from && (
          <button
            className="text-xs text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onRangeSelect(null, null);
            }}
          >
            Effacer la sélection
          </button>
        )}
      </div>

      {/* Empty state */}
      {!collapsed && !hasData && (
        <div className="px-4 pb-4 text-sm text-muted-foreground text-center py-8">
          Importez des transactions pour voir le graphique de cashflow.
        </div>
      )}

      {/* Monthly bar chart */}
      {!collapsed && hasData && granularity === "monthly" && (
        <MonthlyChart
          data={monthlyData}
          onRangeSelect={onRangeSelect}
          selectedRange={selectedRange}
        />
      )}

      {/* Daily cumulative line chart */}
      {!collapsed && hasData && granularity === "daily" && (
        <DailyChart
          data={dailyData}
          onRangeSelect={onRangeSelect}
          selectedRange={selectedRange}
        />
      )}
    </div>
  );
}

/* ===========================================================================
   Monthly bar chart
   =========================================================================== */

function MonthlyChart({
  data,
  onRangeSelect,
  selectedRange,
}: {
  data: CashflowMonthly[];
  onRangeSelect: (from: string | null, to: string | null) => void;
  selectedRange: { from: string | null; to: string | null };
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: formatMonthShort(d.month),
        expensesDisplay: -d.expenses,
      })),
    [data]
  );

  const brushIndices = useMemo(() => {
    if (!selectedRange.from && !selectedRange.to) return null;
    let startIdx = 0;
    let endIdx = chartData.length - 1;
    if (selectedRange.from) {
      const fromMonth = selectedRange.from.slice(0, 7);
      const idx = chartData.findIndex((d) => d.month >= fromMonth);
      if (idx >= 0) startIdx = idx;
    }
    if (selectedRange.to) {
      const toMonth = selectedRange.to.slice(0, 7);
      const idx = chartData.findLastIndex((d) => d.month <= toMonth);
      if (idx >= 0) endIdx = idx;
    }
    return { startIdx, endIdx };
  }, [selectedRange, chartData]);

  const handleBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      if (range.startIndex === undefined || range.endIndex === undefined || !chartData.length) return;
      if (range.startIndex === 0 && range.endIndex === chartData.length - 1) {
        onRangeSelect(null, null);
        return;
      }
      const start = chartData[range.startIndex];
      const end = chartData[range.endIndex];
      const dateFrom = `${start.month}-01`;
      const endDate = new Date(parseInt(end.month.slice(0, 4)), parseInt(end.month.slice(5, 7)), 0);
      onRangeSelect(dateFrom, endDate.toISOString().slice(0, 10));
    },
    [chartData, onRangeSelect]
  );

  const handleBarClick = useCallback(
    (entry: { month: string }) => {
      if (!entry?.month) return;
      const dateFrom = `${entry.month}-01`;
      const endDate = new Date(parseInt(entry.month.slice(0, 4)), parseInt(entry.month.slice(5, 7)), 0);
      onRangeSelect(dateFrom, endDate.toISOString().slice(0, 10));
    },
    [onRangeSelect]
  );

  return (
    <div className="px-2 pb-3" style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barGap={0} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} />
          <Tooltip content={<MonthlyTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} formatter={(v: string) => (v === "income" ? "Revenus" : "Dépenses")} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="income" fill="#10b981" radius={[3, 3, 0, 0]} cursor="pointer" onClick={(e) => handleBarClick(e as { month: string })} />
          <Bar dataKey="expensesDisplay" name="expenses" fill="#ef4444" radius={[0, 0, 3, 3]} cursor="pointer" onClick={(e) => handleBarClick(e as { month: string })} />
          {chartData.length > 3 && (
            <Brush
              dataKey="label"
              height={24}
              stroke="hsl(var(--primary))"
              fill="hsl(var(--muted))"
              travellerWidth={8}
              startIndex={brushIndices?.startIdx ?? 0}
              endIndex={brushIndices?.endIdx ?? chartData.length - 1}
              onChange={handleBrushChange}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ===========================================================================
   Daily cumulative chart
   =========================================================================== */

function DailyChart({
  data,
  onRangeSelect,
  selectedRange,
}: {
  data: CashflowDaily[];
  onRangeSelect: (from: string | null, to: string | null) => void;
  selectedRange: { from: string | null; to: string | null };
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: formatDayShort(d.date),
      })),
    [data]
  );

  // Compute the gradient zero-crossing offset (0 = top, 1 = bottom)
  // This makes the line and fill green above 0 and red below 0.
  const zeroOffset = useMemo(() => {
    if (!chartData.length) return 0.5;
    let maxVal = -Infinity;
    let minVal = Infinity;
    for (const d of chartData) {
      if (d.cumulative > maxVal) maxVal = d.cumulative;
      if (d.cumulative < minVal) minVal = d.cumulative;
    }
    // All positive
    if (minVal >= 0) return 1;
    // All negative
    if (maxVal <= 0) return 0;
    // Mixed: where does 0 fall as a fraction from top?
    return maxVal / (maxVal - minVal);
  }, [chartData]);

  const brushIndices = useMemo(() => {
    if (!selectedRange.from && !selectedRange.to) return null;
    let startIdx = 0;
    let endIdx = chartData.length - 1;
    if (selectedRange.from) {
      const idx = chartData.findIndex((d) => d.date >= selectedRange.from!);
      if (idx >= 0) startIdx = idx;
    }
    if (selectedRange.to) {
      const idx = chartData.findLastIndex((d) => d.date <= selectedRange.to!);
      if (idx >= 0) endIdx = idx;
    }
    return { startIdx, endIdx };
  }, [selectedRange, chartData]);

  const handleBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      if (range.startIndex === undefined || range.endIndex === undefined || !chartData.length) return;
      if (range.startIndex === 0 && range.endIndex === chartData.length - 1) {
        onRangeSelect(null, null);
        return;
      }
      onRangeSelect(chartData[range.startIndex].date, chartData[range.endIndex].date);
    },
    [chartData, onRangeSelect]
  );

  // Show fewer X-axis ticks for readability
  const tickInterval = Math.max(1, Math.floor(chartData.length / 15));

  return (
    <div className="px-2 pb-3" style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <defs>
            {/* Fill gradient: green above 0, red below 0 */}
            <linearGradient id="gradCumulFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#10b981" stopOpacity={0.05} />
              <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#ef4444" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.25} />
            </linearGradient>
            {/* Stroke gradient: green above 0, red below 0 */}
            <linearGradient id="gradCumulStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#10b981" />
              <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#ef4444" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={yFmt} />
          <Tooltip content={<DailyTooltip />} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="url(#gradCumulStroke)"
            fill="url(#gradCumulFill)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
          {chartData.length > 10 && (
            <Brush
              dataKey="label"
              height={24}
              stroke="hsl(var(--primary))"
              fill="hsl(var(--muted))"
              travellerWidth={8}
              startIndex={brushIndices?.startIdx ?? 0}
              endIndex={brushIndices?.endIdx ?? chartData.length - 1}
              onChange={handleBrushChange}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ===========================================================================
   Tooltips
   =========================================================================== */

function MonthlyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income = payload.find((p: any) => p.dataKey === "income")?.value ?? 0;
  const expenses = Math.abs(payload.find((p: any) => p.dataKey === "expensesDisplay")?.value ?? 0);
  const net = income - expenses;
  return (
    <div className="bg-card border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1.5">{label}</p>
      <div className="space-y-0.5">
        <p className="text-emerald-600">Revenus : {formatCurrency(income)}</p>
        <p className="text-red-600">Dépenses : {formatCurrency(expenses)}</p>
        <hr className="my-1 border-border" />
        <p className={net >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
          Solde : {net >= 0 ? "+" : ""}{formatCurrency(net)}
        </p>
      </div>
    </div>
  );
}

function DailyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as CashflowDaily & { label: string };
  if (!point) return null;
  return (
    <div className="bg-card border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1.5">{formatDayLong(point.date)}</p>
      <div className="space-y-0.5">
        {point.income > 0 && <p className="text-emerald-600">+{formatCurrency(point.income)}</p>}
        {point.expenses > 0 && <p className="text-red-600">-{formatCurrency(point.expenses)}</p>}
        <p className="text-muted-foreground text-xs">{point.count} transaction(s) ce jour</p>
        <hr className="my-1 border-border" />
        <p className={`font-semibold ${point.cumulative >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          Cumul : {point.cumulative >= 0 ? "+" : ""}{formatCurrency(point.cumulative)}
        </p>
      </div>
    </div>
  );
}

/* ===========================================================================
   Helpers
   =========================================================================== */

const MONTH_NAMES_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function formatMonthShort(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTH_NAMES_SHORT[parseInt(m) - 1]} ${year.slice(2)}`;
}

function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatDayLong(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function yFmt(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(Math.round(v));
}
