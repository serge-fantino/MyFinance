/**
 * Channel-based chart renderer for AI chat dataviz.
 *
 * Receives a {viz, data} pair where:
 *   - viz: chart type + encoding channels (x, y, color, theta, label, value)
 *   - data: flat array of row objects from the query engine
 *
 * The component maps encoding channels to Recharts props dynamically.
 * Supports view modes: chart, table, debug (spec + SQL).
 */
import { useId, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, ClipboardPaste, ChevronDown, Settings2, X, ExternalLink } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
  Treemap,
} from "recharts";

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
  "#e11d48", "#84cc16",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelEncoding {
  field: string;
  type: "nominal" | "quantitative" | "temporal" | "ordinal";
  format?: "currency" | string;
}

export interface TableColumn {
  field: string;
  label?: string;
  format?: "currency" | string;
}

export interface VizSpec {
  chart: "bar" | "pie" | "area" | "kpi" | "table" | "treemap";
  title?: string;
  encoding: Record<string, ChannelEncoding>;
  columns?: TableColumn[];  // column definitions for table charts
  layout?: "horizontal" | "vertical";  // for bar charts: horizontal = vertical bars, vertical = horizontal bars (Recharts)
}

export interface ChartTrace {
  query?: Record<string, unknown>;
  viz?: Record<string, unknown>;
  sql?: string | null;
  row_count?: number | null;
  error?: string | null;
  duration_ms?: number | null;
}

export interface ChartResult {
  viz: VizSpec;
  data: Record<string, unknown>[];
  trace?: ChartTrace | null;
}

/** Attachment format for pasting/inserting dataviz into chat input */
export interface DatavizAttachment {
  title: string;
  chartType: string;
  data: Record<string, unknown>[];
  columns: { field: string; label: string; format?: string }[];
  query?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatValue(value: unknown, format?: string): string {
  if (value == null) return "";
  const num = Number(value);
  if (format === "currency" && !isNaN(num)) {
    return new Intl.NumberFormat("fr-FR", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(num) + " \u20ac";
  }
  if (!isNaN(num) && typeof value === "number") {
    return new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 2,
    }).format(num);
  }
  return String(value);
}

/** Darken a hex color by a factor (0–1, e.g. 0.2 = 20% darker) */
function darkenHex(hex: string, factor: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r = Math.max(0, parseInt(m[1], 16) * (1 - factor));
  const g = Math.max(0, parseInt(m[2], 16) * (1 - factor));
  const b = Math.max(0, parseInt(m[3], 16) * (1 - factor));
  return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
}

/** Format temporal x value for tooltip (e.g. "2025-04-01T00:00:00+00:00" → "Avril 2025") */
function formatTemporalLabel(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Custom tooltip for stacked area: breakdown by category + total, or single category when selected */
function AreaStackTooltip({
  active,
  payload,
  label,
  xField,
  yFmt,
  series,
  selectedCategory,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  xField: string;
  yFmt?: string;
  series: string[];
  selectedCategory: string | null;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as Record<string, unknown> | undefined;
  const header = point ? formatTemporalLabel(point[xField]) : String(label ?? "");
  let items = payload.filter((p) => p.value !== 0 && p.value != null);
  if (selectedCategory) {
    items = items.filter((p) => p.name === selectedCategory);
  }
  const total = selectedCategory ? 0 : items.reduce((s, p) => s + Number(p.value), 0);
  return (
    <div className="bg-card border rounded-lg shadow-lg px-3 py-2.5 text-sm min-w-[160px]">
      <p className="font-semibold mb-2 text-foreground">{header}</p>
      <div className="space-y-1">
        {items.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 truncate">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="truncate">{p.name}</span>
            </span>
            <span className="font-medium tabular-nums flex-shrink-0">
              {formatValue(p.value, yFmt)}
            </span>
          </div>
        ))}
      </div>
      {!selectedCategory && items.length > 0 && (
        <>
          <hr className="my-1.5 border-border" />
          <div className="flex justify-between items-center font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatValue(total, yFmt)}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Simple tooltip for single-series area (no color) */
function AreaSimpleTooltip({
  active,
  payload,
  label,
  xField,
  yField,
  yFmt,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, unknown> }>;
  label?: string;
  xField: string;
  yField: string;
  yFmt?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const header = point ? formatTemporalLabel(point[xField]) : String(label ?? "");
  const value = payload[0]?.value ?? point?.[yField];
  return (
    <div className="bg-card border rounded-lg shadow-lg px-3 py-2.5 text-sm">
      <p className="font-semibold mb-1">{header}</p>
      <p className="font-medium tabular-nums">{formatValue(value, yFmt)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart components
// ---------------------------------------------------------------------------

function KPIChart({ data, viz }: { data: Record<string, unknown>[]; viz: VizSpec }) {
  const labelChannel = viz.encoding.label;
  const valueChannel = viz.encoding.value || viz.encoding.y;
  const labelField = labelChannel?.field || "label";
  const valueField = valueChannel?.field || "value";
  const valueFmt = valueChannel?.format;

  return (
    <div className="my-3">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {data.map((item, i) => (
          <div key={i} className="rounded-lg border bg-card p-3 text-center">
            <div className="text-xs text-muted-foreground">{String(item[labelField] || "")}</div>
            <div className="text-lg font-bold mt-1">
              {formatValue(item[valueField], valueFmt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChartBlock({ data, viz }: { data: Record<string, unknown>[]; viz: VizSpec }) {
  const xChannel = viz.encoding.x;
  const yChannel = viz.encoding.y;
  if (!xChannel || !yChannel) return null;

  const xField = xChannel.field;
  const yField = yChannel.field;
  const yFmt = yChannel.format;
  const colorChannel = viz.encoding.color;
  const colorField = colorChannel?.field;
  const layout = viz.layout ?? "horizontal";

  // Stacked: color different from x → pivot long→wide, multiple Bar with stackId
  const isStacked = colorField && colorField !== xField;
  const { chartData, series } = isStacked
    ? (() => {
        const byX = new Map<string, Record<string, unknown>>();
        const allCats = new Set<string>();
        for (const row of data) {
          const xVal = String(row[xField] ?? "");
          const catVal = String(row[colorField] ?? "?");
          const yVal = Number(row[yField]) || 0;
          allCats.add(catVal);
          if (!byX.has(xVal)) byX.set(xVal, { [xField]: xVal });
          const entry = byX.get(xVal)!;
          entry[catVal] = (Number(entry[catVal]) || 0) + yVal;
        }
        const catTotals = new Map<string, number>();
        for (const row of data) {
          const c = String(row[colorField] ?? "?");
          const v = Number(row[yField]) || 0;
          catTotals.set(c, (catTotals.get(c) ?? 0) + v);
        }
        const cats = Array.from(allCats).sort((a, b) =>
          (catTotals.get(a) ?? 0) - (catTotals.get(b) ?? 0)
        );
        const sorted = Array.from(byX.entries())
          .sort((a, b) => String(a[1][xField]).localeCompare(String(b[1][xField])))
          .map(([, entry]) => {
            const out: Record<string, unknown> = { [xField]: entry[xField] };
            for (const c of cats) out[c] = entry[c] ?? 0;
            return out;
          });
        return { chartData: sorted, series: cats };
      })()
    : { chartData: data, series: [] as string[] };

  const barColor = _semanticColor(yField) || COLORS[0];
  const yValues = chartData.flatMap((d) =>
    isStacked ? series.map((c) => Number(d[c]) || 0) : [Number(d[yField]) || 0]
  ).filter((v) => !isNaN(v));
  const allNegative = yValues.length > 0 && yValues.every((v) => v <= 0);
  const yDomain = allNegative ? ["dataMin", 0] : undefined;

  return (
    <div className="my-3">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <ResponsiveContainer width="100%" height={layout === "vertical" ? 280 : 220}>
        <BarChart data={chartData} layout={layout} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          {layout === "horizontal" ? (
            <>
              <XAxis dataKey={xField} tick={{ fontSize: 11 }} />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  yFmt === "currency" ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
            </>
          ) : (
            <>
              <XAxis
                type="number"
                domain={yDomain}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  yFmt === "currency" ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <YAxis dataKey={xField} type="category" width={80} tick={{ fontSize: 11 }} />
            </>
          )}
          <Tooltip formatter={(value: number) => formatValue(value, yFmt)} />
          {isStacked && <Legend />}
          {isStacked ? (
            series.map((cat, i) => (
              <Bar
                key={cat}
                dataKey={cat}
                name={cat}
                stackId="1"
                fill={COLORS[i % COLORS.length]}
                radius={layout === "horizontal" ? [3, 3, 0, 0] : [0, 3, 3, 0]}
              />
            ))
          ) : (
            <Bar
              dataKey={yField}
              fill={barColor}
              radius={layout === "horizontal" ? [3, 3, 0, 0] : [0, 3, 3, 0]}
            >
              {colorChannel && colorChannel.field === xField && data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieChartBlock({ data, viz }: { data: Record<string, unknown>[]; viz: VizSpec }) {
  const thetaChannel = viz.encoding.theta || viz.encoding.y || viz.encoding.value;
  const colorChannel = viz.encoding.color || viz.encoding.x || viz.encoding.label;
  if (!thetaChannel || !colorChannel) return null;

  const valueField = thetaChannel.field;
  const nameField = colorChannel.field;
  const valueFmt = thetaChannel.format;

  // Pie chart requires positive values — use absolute value for slice size (expenses are negative)
  const PIE_VALUE_KEY = "_pieValue";
  const pieData = data.map((row) => ({
    ...row,
    [PIE_VALUE_KEY]: Math.abs(Number(row[valueField]) || 0),
  }));

  return (
    <div className="my-3">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <div className="flex items-start gap-4">
        <div className="min-w-[200px] w-[200px] h-[200px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={85}
                dataKey={PIE_VALUE_KEY}
                nameKey={nameField}
                label={({ name }) => String(name || "").slice(0, 14)}
                labelLine={false}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(_: number, __: string, item: { payload?: Record<string, unknown> }) =>
                  formatValue(item?.payload?.[valueField] ?? 0, valueFmt)
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1 pt-2 min-w-0">
          {data.slice(0, 8).map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="truncate">{String(item[nameField] || "")}</span>
              <span className="ml-auto font-medium">{formatValue(item[valueField], valueFmt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AreaChartBlock({ data, viz }: { data: Record<string, unknown>[]; viz: VizSpec }) {
  const gradientId = useId().replace(/:/g, "-");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const xChannel = viz.encoding.x;
  const yChannel = viz.encoding.y;
  const colorChannel = viz.encoding.color;
  if (!xChannel || !yChannel) return null;

  const xField = xChannel.field;
  const yField = yChannel.field;
  const yFmt = yChannel.format;
  const colorField = colorChannel?.field;

  // With color: pivot long→wide for stacked areas (month | category1 | category2 | ...)
  // IMPORTANT: every (x, category) must have a defined value — Recharts breaks stacking on undefined
  const { chartData, series } = colorField
    ? (() => {
        const byX = new Map<string, Record<string, unknown>>();
        const allCats = new Set<string>();
        for (const row of data) {
          const xVal = String(row[xField] ?? "");
          const catVal = String(row[colorField] ?? "?");
          const yVal = Number(row[yField]) || 0;
          allCats.add(catVal);
          if (!byX.has(xVal)) byX.set(xVal, { [xField]: xVal });
          const entry = byX.get(xVal)!;
          entry[catVal] = (Number(entry[catVal]) || 0) + yVal;
        }
        // Sort categories by total (desc) so largest segments stack at base — more readable
        const catTotals = new Map<string, number>();
        for (const row of data) {
          const c = String(row[colorField] ?? "?");
          const v = Number(row[yField]) || 0;
          catTotals.set(c, (catTotals.get(c) ?? 0) + v);
        }
        const cats = Array.from(allCats).sort((a, b) =>
          (catTotals.get(a) ?? 0) - (catTotals.get(b) ?? 0)
        );
        const sorted = Array.from(byX.entries())
          .sort((a, b) => String(a[1][xField]).localeCompare(String(b[1][xField])))
          .map(([, entry]) => {
            const out: Record<string, unknown> = { [xField]: entry[xField] };
            for (const c of cats) out[c] = entry[c] ?? 0;
            return out;
          });
        return { chartData: sorted, series: cats };
      })()
    : { chartData: data, series: [] as string[] };

  const chartHeight = 340;

  return (
    <div className="my-3">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <div
        className="resize-y overflow-hidden rounded-lg border border-border/50"
        style={{ minHeight: chartHeight, height: chartHeight, maxHeight: 600 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey={xField} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) =>
              yFmt === "currency" ? `${(v / 1000).toFixed(0)}k` : String(v)
            } />
            {colorField && series.length > 0 ? (
              <Tooltip
                content={(props) => (
                  <AreaStackTooltip
                    {...props}
                    xField={xField}
                    yFmt={yFmt}
                    series={series}
                    selectedCategory={selectedCategory}
                  />
                )}
              />
            ) : (
              <Tooltip
                content={(props) => (
                  <AreaSimpleTooltip {...props} xField={xField} yField={yField} yFmt={yFmt} />
                )}
              />
            )}
            {colorField && series.length > 0 ? (
            <>
              <Legend
                content={() => (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2 text-xs">
                    {series.map((cat, i) => {
                      const base = COLORS[i % COLORS.length];
                      const isSelected = selectedCategory === cat;
                      const color = isSelected ? darkenHex(base, 0.35) : base;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(isSelected ? null : cat)}
                          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-muted/60 transition-colors"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-border/50"
                            style={{ backgroundColor: color }}
                          />
                          <span className={isSelected ? "font-semibold" : ""}>{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
              {series.map((cat, i) => {
                const base = COLORS[i % COLORS.length];
                const isSelected = selectedCategory === cat;
                const color = isSelected ? darkenHex(base, 0.35) : base;
                return (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    name={cat}
                    stackId="1"
                    stroke={color}
                    fill={color}
                    fillOpacity={0.6}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                );
              })}
            </>
          ) : (
            <>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey={yField}
                stroke="#3b82f6"
                fill={`url(#${gradientId})`}
                strokeWidth={2}
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

interface TreemapCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  value?: number;
  fill?: string;
  percentage?: number;
  valueFmt?: string;
}

function TreemapCellContent(props: TreemapCellProps) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", value = 0, fill = "", percentage = 0, valueFmt } = props;
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
            {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7)) + "…" : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.85)"
            fontSize={10}
          >
            {formatValue(value, valueFmt)} ({percentage}%)
          </text>
        </>
      )}
    </g>
  );
}

function TreemapChartBlock({ data, viz }: { data: Record<string, unknown>[]; viz: VizSpec }) {
  const weightChannel = viz.encoding.weight || viz.encoding.y || viz.encoding.theta || viz.encoding.value;
  const colorChannel = viz.encoding.color || viz.encoding.x || viz.encoding.label;
  if (!weightChannel || !colorChannel) return null;

  const weightField = weightChannel.field;
  const colorField = colorChannel.field;
  const weightFmt = weightChannel.format;

  const total = data.reduce((s, row) => s + Math.abs(Number(row[weightField]) || 0), 0);
  const treemapData = data.map((row, i) => {
    const val = Math.abs(Number(row[weightField]) || 0);
    const pct = total > 0 ? (100 * val) / total : 0;
    return {
      name: String(row[colorField] ?? "?"),
      value: val,
      fill: COLORS[i % COLORS.length],
      percentage: Math.round(pct * 10) / 10,
    };
  });

  return (
    <div className="my-3">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <div className="rounded-lg border border-border/50 overflow-hidden" style={{ minHeight: 340, height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="value"
            aspectRatio={4 / 3}
            stroke="hsl(var(--background))"
            content={<TreemapCellContent valueFmt={weightFmt} />}
          >
            <Tooltip
              formatter={(value: number) => formatValue(value, weightFmt)}
              contentStyle={{ fontSize: 12 }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TableBlock({ data, viz }: { data: Record<string, unknown>[]; viz: VizSpec }) {
  // Columns from viz spec, or auto-detect from data keys
  const columns: TableColumn[] = viz.columns && viz.columns.length > 0
    ? viz.columns
    : Object.keys(data[0] || {}).map((k) => ({ field: k, label: k }));

  return (
    <div className="my-3 overflow-x-auto">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                className="text-left px-2 py-1.5 border-b font-medium text-muted-foreground text-xs"
              >
                {col.label || col.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri} className="border-b border-muted/50 hover:bg-muted/30">
              {columns.map((col, ci) => {
                const val = row[col.field];
                const isAmount = col.format === "currency" || col.field === "amount";
                const numVal = Number(val);
                const isNeg = isAmount && !isNaN(numVal) && numVal < 0;
                const isPos = isAmount && !isNaN(numVal) && numVal > 0;
                return (
                  <td
                    key={ci}
                    className={`px-2 py-1.5 text-xs ${
                      isNeg ? "text-red-600" : isPos ? "text-emerald-600" : ""
                    } ${isAmount ? "text-right font-medium tabular-nums" : ""}`}
                  >
                    {formatValue(val, col.format)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length >= 50 && (
        <div className="text-xs text-muted-foreground mt-1 text-center">
          {data.length} lignes affichées (limite atteinte)
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy / export for LLM prompt
// ---------------------------------------------------------------------------

function formatValueForCopy(value: unknown, format?: string): string {
  if (value == null) return "";
  const num = Number(value);
  if (format === "currency" && !isNaN(num)) {
    return new Intl.NumberFormat("fr-FR", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(num) + " €";
  }
  if (!isNaN(num) && typeof value === "number") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(num);
  }
  return String(value);
}

const DATAVIZ_PREFIX = "MyFinance-Dataviz:";

/** Convert chart to attachment for chat input */
export function chartToAttachment(chart: ChartResult): DatavizAttachment {
  const { viz, data, trace } = chart;
  const columns: { field: string; label: string; format?: string }[] =
    viz.columns && viz.columns.length > 0
      ? viz.columns.map((c) => ({ field: c.field, label: c.label || c.field, format: c.format }))
      : Object.keys(data[0] || {}).map((k) => ({
          field: k,
          label: k,
          format: k === "amount" || k.toLowerCase().includes("total") || k.toLowerCase().includes("montant") ? "currency" : undefined,
        }));
  return {
    title: viz.title || "Données",
    chartType: viz.chart || "table",
    data,
    columns,
    query: trace?.query,
  };
}

/** Serialize attachment for clipboard (paste detection) */
export function attachmentToClipboard(att: DatavizAttachment): string {
  return DATAVIZ_PREFIX + JSON.stringify(att);
}

/** Parse attachment from pasted text. Returns null if not our format. */
export function parseAttachmentFromClipboard(text: string): DatavizAttachment | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(DATAVIZ_PREFIX)) return null;
  try {
    const afterPrefix = trimmed.slice(DATAVIZ_PREFIX.length);
    const json = afterPrefix.includes("\n") ? afterPrefix.split("\n")[0] : afterPrefix;
    const parsed = JSON.parse(json) as DatavizAttachment;
    if (parsed?.title && Array.isArray(parsed?.data) && Array.isArray(parsed?.columns)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Format attachment as text for LLM prompt */
export function attachmentToPromptText(att: DatavizAttachment): string {
  const headerRow = "| " + att.columns.map((c) => c.label).join(" | ") + " |";
  const separator = "|" + att.columns.map(() => "---").join("|") + "|";
  const dataRows = att.data.map((row) =>
    "| " + att.columns.map((c) => formatValueForCopy(row[c.field], c.format)).join(" | ") + " |"
  );
  const table = [headerRow, separator, ...dataRows].join("\n");
  let out = `[Données: ${att.title} - ${att.data.length} ligne${att.data.length > 1 ? "s" : ""}]\n\n${table}`;
  if (att.query && Object.keys(att.query).length > 0) {
    out += `\n\n[Query: ${JSON.stringify(att.query)}]`;
  }
  return out;
}

/** Format chart for copy (legacy / external paste) - human readable */
export function formatChartForCopy(chart: ChartResult, options?: { includePrompt?: boolean }): string {
  const att = chartToAttachment(chart);
  const text = attachmentToPromptText(att);
  const clipboard = attachmentToClipboard(att);
  return options?.includePrompt !== false
    ? `${clipboard}\n\n---\n\n${text}\n\nPeux-tu analyser ces données et me donner des insights ou recommandations ?`
    : `${clipboard}\n\n---\n\n${text}`;
}

// ---------------------------------------------------------------------------
// Chart type switching (when compatible)
// ---------------------------------------------------------------------------

type ChartTypeOption = "bar" | "column" | "pie" | "area" | "kpi" | "treemap";

const CHART_TYPE_LABELS: Record<ChartTypeOption, string> = {
  bar: "Barres (H)",
  column: "Colonnes (V)",
  pie: "Secteurs",
  area: "Aires",
  kpi: "KPI",
  treemap: "Treemap",
};

/** Return chart types that can be displayed with the current viz encoding */
function getCompatibleChartTypes(viz: VizSpec): ChartTypeOption[] {
  const enc = viz.encoding || {};
  const types: ChartTypeOption[] = [];

  // bar/pie/kpi/treemap: need category + value (flat data: one row per category)
  const catField = enc.color?.field || enc.x?.field || enc.label?.field;
  const valField = enc.theta?.field || enc.y?.field || enc.value?.field || enc.weight?.field;
  if (catField && valField) {
    types.push("bar", "column", "pie", "kpi", "treemap");
  }

  // area: need x + y. area with color uses pivoted data — only area compatible
  const xField = enc.x?.field;
  const yField = enc.y?.field;
  const hasColor = !!enc.color?.field;
  if (xField && yField) {
    if (!hasColor) {
      types.push("area", "bar", "column");
    } else {
      types.push("area");
    }
  }

  return [...new Set(types)];
}

/** Adapt viz encoding for a target chart type */
function adaptVizForChartType(viz: VizSpec, target: ChartTypeOption): VizSpec {
  const enc = viz.encoding || {};
  const catField = enc.color?.field || enc.x?.field || enc.label?.field;
  const valField = enc.theta?.field || enc.y?.field || enc.value?.field || enc.weight?.field;
  const xField = enc.x?.field;
  const yField = enc.y?.field;
  const valFmt = enc.theta?.format || enc.y?.format || enc.value?.format;

  if ((target === "bar" || target === "column") && catField && valField) {
    return {
      ...viz,
      chart: "bar",
      layout: target === "column" ? "horizontal" : "vertical",  // Recharts: horizontal = vertical bars
      encoding: {
        x: { field: catField, type: "nominal" },
        y: { field: valField, type: "quantitative", format: valFmt },
      },
    };
  }
  if (target === "pie" && catField && valField) {
    return {
      ...viz,
      chart: "pie",
      encoding: {
        theta: { field: valField, type: "quantitative", format: valFmt },
        color: { field: catField, type: "nominal" },
      },
    };
  }
  if (target === "kpi" && catField && valField) {
    return {
      ...viz,
      chart: "kpi",
      encoding: {
        label: { field: catField, type: "nominal" },
        value: { field: valField, type: "quantitative", format: valFmt },
      },
    };
  }
  if (target === "treemap" && catField && valField) {
    return {
      ...viz,
      chart: "treemap",
      encoding: {
        weight: { field: valField, type: "quantitative", format: valFmt },
        color: { field: catField, type: "nominal" },
      },
    };
  }
  if (target === "area" && xField && yField) {
    return {
      ...viz,
      chart: "area",
      encoding: {
        x: enc.x!,
        y: enc.y || { field: valField!, type: "quantitative", format: valFmt },
        color: enc.color,
      },
    };
  }
  return viz;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _semanticColor(fieldName: string): string | null {
  const fl = fieldName.toLowerCase();
  if (fl.includes("revenu") || fl.includes("income")) return "#10b981";
  if (fl.includes("d\u00e9pense") || fl.includes("depense") || fl.includes("expense")) return "#ef4444";
  return null;
}

// ---------------------------------------------------------------------------
// Chart config panel (encoding editor)
// ---------------------------------------------------------------------------

const CHANNEL_LABELS: Record<string, string> = {
  x: "Axe X / Catégories",
  y: "Valeur (Y)",
  color: "Couleur / Série (empilé)",
  theta: "Valeur (angle)",
  label: "Libellé",
  value: "Valeur",
  weight: "Poids (taille)",
};

function ChartConfigPanel({
  viz,
  data,
  chartType,
  onVizChange,
  onClose,
  onReset,
}: {
  viz: VizSpec;
  data: Record<string, unknown>[];
  chartType: ChartTypeOption | "table";
  onVizChange: (viz: VizSpec) => void;
  onClose: () => void;
  onReset?: () => void;
}) {
  const fields = data[0] ? Object.keys(data[0]) : [];
  const enc = viz.encoding || {};

  const channelsForType: Record<string, { required: boolean }> =
    chartType === "bar" || chartType === "column"
      ? { x: { required: true }, y: { required: true }, color: { required: false } }
      : chartType === "pie"
        ? { theta: { required: true }, color: { required: true } }
        : chartType === "area"
          ? { x: { required: true }, y: { required: true }, color: { required: false } }
          : chartType === "kpi"
            ? { label: { required: true }, value: { required: true } }
            : chartType === "treemap"
              ? { weight: { required: true }, color: { required: true } }
              : {};

  const updateChannel = (key: string, field: string | null, format?: string) => {
    const next = { ...viz, encoding: { ...enc } };
    if (field) {
      (next.encoding as Record<string, ChannelEncoding>)[key] = {
        field,
        type: key === "y" || key === "theta" || key === "value" || key === "weight" ? "quantitative" : "nominal",
        format: format ?? (key === "y" || key === "theta" || key === "value" || key === "weight" ? "currency" : undefined),
      };
    } else {
      delete (next.encoding as Record<string, unknown>)[key];
    }
    onVizChange(next);
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-muted-foreground flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5" />
          Config encodage
        </span>
        <div className="flex items-center gap-1">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="px-1.5 py-0.5 text-[10px] rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              Réinitialiser
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {Object.entries(channelsForType).map(([key, { required }]) => {
          const ch = enc[key as keyof typeof enc];
          const val = ch?.field ?? "";
          return (
            <div key={key} className="flex items-center gap-2">
              <label className="w-36 shrink-0 text-muted-foreground">
                {CHANNEL_LABELS[key] ?? key}
              </label>
              <select
                value={val}
                onChange={(e) => updateChannel(key, e.target.value || null)}
                className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1 text-[11px]"
              >
                <option value="">{required ? "— sélectionner —" : "— aucun —"}</option>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              {!required && val && (
                <button
                  type="button"
                  onClick={() => updateChannel(key, null)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                  title="Retirer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Button to open chart in Query module with pre-filled query and viz */
function OpenInQueryButton({ query, viz }: { query: Record<string, unknown>; viz: Record<string, unknown> }) {
  const navigate = useNavigate();
  const handleOpen = () => {
    const q = btoa(unescape(encodeURIComponent(JSON.stringify(query))));
    const v = btoa(unescape(encodeURIComponent(JSON.stringify(viz))));
    navigate(`/query?query=${encodeURIComponent(q)}&viz=${encodeURIComponent(v)}`);
  };
  return (
    <button
      onClick={handleOpen}
      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      title="Ouvrir dans Query"
    >
      <ExternalLink className="w-3 h-3" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// View mode tabs
// ---------------------------------------------------------------------------

type ViewMode = "chart" | "table" | "debug";

function ChartViewTabs({
  chart,
  viewMode,
  onViewModeChange,
  onCopy,
  onAddAsAttachment,
  chartTypeOverride,
  onChartTypeChange,
  compatibleTypes,
  configOpen,
  onConfigToggle,
}: {
  chart: ChartResult;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onCopy: () => void;
  onAddAsAttachment?: (att: DatavizAttachment) => void;
  chartTypeOverride?: ChartTypeOption | null;
  onChartTypeChange?: (t: ChartTypeOption | null) => void;
  compatibleTypes?: ChartTypeOption[];
  configOpen?: boolean;
  onConfigToggle?: () => void;
}) {
  const { viz, data, trace } = chart;
  const hasTrace = trace && (trace.sql != null || trace.query != null);
  const [copied, setCopied] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const baseChart = (viz.chart === "table" ? "table" : viz.chart) as ChartTypeOption | "table";
  const effectiveType = chartTypeOverride ?? (baseChart === "table" ? "bar" : baseChart);
  const canSwitch = compatibleTypes && compatibleTypes.length > 1 && viewMode === "chart";

  const handleCopy = async () => {
    const att = chartToAttachment(chart);
    await navigator.clipboard.writeText(attachmentToClipboard(att));
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAddAsAttachment = () => {
    onAddAsAttachment?.(chartToAttachment(chart));
  };

  return (
    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => onViewModeChange("chart")}
          className={`px-2 py-1 text-[11px] rounded transition-colors ${
            viewMode === "chart" ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
          }`}
        >
          Graphique
        </button>
        <button
          onClick={() => onViewModeChange("table")}
          className={`px-2 py-1 text-[11px] rounded transition-colors ${
            viewMode === "table" ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
          }`}
        >
          Tableau
        </button>
        {hasTrace && (
          <button
            onClick={() => onViewModeChange("debug")}
            className={`px-2 py-1 text-[11px] rounded transition-colors ${
              viewMode === "debug" ? "bg-amber-100 text-amber-800 font-medium" : "hover:bg-muted text-muted-foreground"
            }`}
          >
            Debug
          </button>
        )}
        {canSwitch && onChartTypeChange && (
          <div className="relative ml-1">
            <button
              type="button"
              onClick={() => setTypeMenuOpen((o) => !o)}
              className="px-2 py-1 text-[11px] rounded border border-border/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {CHART_TYPE_LABELS[effectiveType]}
              <ChevronDown className="w-3 h-3" />
            </button>
            {typeMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setTypeMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute left-0 top-full mt-0.5 z-20 bg-card border border-border rounded-md shadow-lg py-1 min-w-[100px]">
                  {compatibleTypes!.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        onChartTypeChange(effectiveType === t ? null : t);
                        setTypeMenuOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 text-[11px] hover:bg-muted ${
                        effectiveType === t ? "font-medium text-primary" : ""
                      }`}
                    >
                      {CHART_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {trace?.query && trace?.viz && (
          <OpenInQueryButton query={trace.query} viz={trace.viz} />
        )}
        {onConfigToggle && viewMode === "chart" && (
          <button
            onClick={onConfigToggle}
            className={`p-1.5 rounded transition-colors ${
              configOpen ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
            title="Configurer les encodages (x, y, couleur…)"
          >
            <Settings2 className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title={copied ? "Copié !" : "Copier les données (pour prompt LLM)"}
        >
          <Copy className="w-3 h-3" />
        </button>
        {onAddAsAttachment && (
          <button
            onClick={handleAddAsAttachment}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Joindre comme pièce jointe"
          >
            <ClipboardPaste className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatChart({
  chart,
  onAddAsAttachment,
  onVizChange,
}: {
  chart: ChartResult;
  onAddAsAttachment?: (att: DatavizAttachment) => void;
  /** Called when user modifies viz from interactive view (chart type, config panel). Syncs back to parent. */
  onVizChange?: (viz: VizSpec) => void;
}) {
  const { viz, data, trace } = chart;
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const [chartTypeOverride, setChartTypeOverride] = useState<ChartTypeOption | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [vizOverride, setVizOverride] = useState<VizSpec | null>(null);

  if (!data || data.length === 0) return null;

  const baseChart = viz.chart === "table" ? "table" : viz.chart === "bar" ? "column" : viz.chart;
  const effectiveChart = chartTypeOverride ?? (baseChart === "table" ? "bar" : baseChart);
  let effectiveViz = chartTypeOverride
    ? adaptVizForChartType(viz, chartTypeOverride)
    : viz.chart === "bar" && !viz.layout
      ? { ...viz, layout: "horizontal" as const }
      : viz;
  if (vizOverride) {
    effectiveViz = { ...effectiveViz, ...vizOverride, encoding: { ...effectiveViz.encoding, ...vizOverride.encoding } };
  }
  const compatibleTypes = getCompatibleChartTypes(viz);

  // Push viz changes from interactive view (chart type, config) back to parent
  useEffect(() => {
    if (!onVizChange || (chartTypeOverride === null && vizOverride === null)) return;
    let next: VizSpec = chartTypeOverride
      ? adaptVizForChartType(viz, chartTypeOverride)
      : viz.chart === "bar" && !viz.layout
        ? { ...viz, layout: "horizontal" as const }
        : viz;
    if (vizOverride) {
      next = { ...next, ...vizOverride, encoding: { ...next.encoding, ...vizOverride.encoding } };
    }
    onVizChange(next);
  }, [chartTypeOverride, vizOverride, viz, onVizChange]);

  return (
    <div className="my-2 rounded-lg border bg-card/50 overflow-hidden">
      <div className="px-3 pt-2">
        <ChartViewTabs
          chart={chart}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onCopy={() => {}}
          onAddAsAttachment={onAddAsAttachment}
          chartTypeOverride={chartTypeOverride}
          onChartTypeChange={setChartTypeOverride}
          compatibleTypes={compatibleTypes}
          configOpen={configOpen}
          onConfigToggle={() => setConfigOpen((o) => !o)}
        />
      </div>
      <div className="px-3 pb-3">
        {configOpen && viewMode === "chart" && (
          <ChartConfigPanel
            viz={effectiveViz}
            data={data}
            chartType={effectiveChart}
            onVizChange={setVizOverride}
            onClose={() => setConfigOpen(false)}
            onReset={vizOverride ? () => setVizOverride(null) : undefined}
          />
        )}
        {viewMode === "chart" && (
          <>
            {effectiveChart === "kpi" && <KPIChart data={data} viz={effectiveViz} />}
            {(effectiveChart === "bar" || effectiveChart === "column") && (
              <BarChartBlock data={data} viz={effectiveViz} />
            )}
            {effectiveChart === "pie" && <PieChartBlock data={data} viz={effectiveViz} />}
            {effectiveChart === "area" && <AreaChartBlock data={data} viz={effectiveViz} />}
            {effectiveChart === "treemap" && <TreemapChartBlock data={data} viz={effectiveViz} />}
            {effectiveChart === "table" && <TableBlock data={data} viz={effectiveViz} />}
            {effectiveChart !== "kpi" && effectiveChart !== "bar" && effectiveChart !== "column" && effectiveChart !== "pie" && effectiveChart !== "area" && effectiveChart !== "treemap" && effectiveChart !== "table" && null}
          </>
        )}
        {viewMode === "table" && <TableBlock data={data} viz={viz} />}
        {viewMode === "debug" && trace && (
          <div className="space-y-3 text-xs">
            <div>
              <div className="font-medium text-muted-foreground mb-1">Spec dataviz</div>
              <pre className="bg-muted rounded p-2 overflow-x-auto max-h-40 overflow-y-auto text-[10px]">
                {JSON.stringify(trace.viz ?? viz, null, 2)}
              </pre>
            </div>
            {trace.sql != null && (
              <div>
                <div className="font-medium text-muted-foreground mb-1">SQL</div>
                <pre className="bg-muted rounded p-2 overflow-x-auto max-h-40 overflow-y-auto text-[10px] whitespace-pre-wrap">
                  {trace.sql}
                </pre>
              </div>
            )}
            {trace.query != null && (
              <div>
                <div className="font-medium text-muted-foreground mb-1">Query DSL</div>
                <pre className="bg-muted rounded p-2 overflow-x-auto max-h-32 overflow-y-auto text-[10px]">
                  {JSON.stringify(trace.query, null, 2)}
                </pre>
              </div>
            )}
            {trace.error && (
              <div className="text-red-600 bg-red-50 rounded p-2">{trace.error}</div>
            )}
            {trace.duration_ms != null && (
              <div className="text-muted-foreground text-[10px]">{trace.duration_ms.toFixed(0)} ms</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
