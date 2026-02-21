/**
 * Channel-based chart renderer for AI chat dataviz.
 *
 * Receives a {viz, data} pair where:
 *   - viz: chart type + encoding channels (x, y, color, theta, label, value)
 *   - data: flat array of row objects from the query engine
 *
 * The component maps encoding channels to Recharts props dynamically.
 */
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
  chart: "bar" | "pie" | "area" | "kpi" | "table";
  title?: string;
  encoding: Record<string, ChannelEncoding>;
  columns?: TableColumn[];  // column definitions for table charts
}

export interface ChartResult {
  viz: VizSpec;
  data: Record<string, unknown>[];
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

  const barColor = _semanticColor(yField) || COLORS[0];

  return (
    <div className="my-3">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey={xField} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) =>
            yFmt === "currency" ? `${(v / 1000).toFixed(0)}k` : String(v)
          } />
          <Tooltip formatter={(value: number) => formatValue(value, yFmt)} />
          {colorChannel && colorChannel.field !== xField && <Legend />}
          <Bar dataKey={yField} fill={barColor} radius={[3, 3, 0, 0]}>
            {colorChannel && data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
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

  return (
    <div className="my-3">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <div className="flex items-start gap-4">
        <ResponsiveContainer width="50%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey={valueField}
              nameKey={nameField}
              label={({ name }) => String(name || "").slice(0, 12)}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatValue(value, valueFmt)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1 pt-2">
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
  const xChannel = viz.encoding.x;
  const yChannel = viz.encoding.y;
  if (!xChannel || !yChannel) return null;

  const xField = xChannel.field;
  const yField = yChannel.field;
  const yFmt = yChannel.format;

  return (
    <div className="my-3">
      {viz.title && <div className="text-sm font-medium text-muted-foreground mb-2">{viz.title}</div>}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="chatAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey={xField} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) =>
            yFmt === "currency" ? `${(v / 1000).toFixed(0)}k` : String(v)
          } />
          <Tooltip formatter={(value: number) => formatValue(value, yFmt)} />
          <Area
            type="monotone"
            dataKey={yField}
            stroke="#3b82f6"
            fill="url(#chatAreaGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
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
// Helpers
// ---------------------------------------------------------------------------

function _semanticColor(fieldName: string): string | null {
  const fl = fieldName.toLowerCase();
  if (fl.includes("revenu") || fl.includes("income")) return "#10b981";
  if (fl.includes("d\u00e9pense") || fl.includes("depense") || fl.includes("expense")) return "#ef4444";
  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatChart({ chart }: { chart: ChartResult }) {
  const { viz, data } = chart;

  if (!data || data.length === 0) return null;

  switch (viz.chart) {
    case "kpi":
      return <KPIChart data={data} viz={viz} />;
    case "bar":
      return <BarChartBlock data={data} viz={viz} />;
    case "pie":
      return <PieChartBlock data={data} viz={viz} />;
    case "area":
      return <AreaChartBlock data={data} viz={viz} />;
    case "table":
      return <TableBlock data={data} viz={viz} />;
    default:
      return null;
  }
}
