/**
 * Renders inline charts in chat messages.
 * Supports bar, pie, area, and kpi chart types.
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

interface ChartBlock {
  type: "bar" | "pie" | "area" | "kpi";
  title?: string;
  data: Record<string, unknown>[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(value) + " €";
}

function KPIChart({ data, title }: { data: Record<string, unknown>[]; title?: string }) {
  return (
    <div className="my-3">
      {title && <div className="text-sm font-medium text-muted-foreground mb-2">{title}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {data.map((item, i) => (
          <div key={i} className="rounded-lg border bg-card p-3 text-center">
            <div className="text-xs text-muted-foreground">{String(item.label || item.name || "")}</div>
            <div className="text-lg font-bold mt-1">
              {formatCurrency(Number(item.value || 0))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChartBlock({ data, title }: { data: Record<string, unknown>[]; title?: string }) {
  // Detect keys (exclude "label", "name", "month", "date")
  const labelKey = data[0] && ("label" in data[0] ? "label" : "month" in data[0] ? "month" : "name" in data[0] ? "name" : "date");
  const valueKeys = data[0]
    ? Object.keys(data[0]).filter((k) => k !== labelKey && typeof data[0][k] === "number")
    : [];

  const barColors: Record<string, string> = {};
  valueKeys.forEach((key, i) => {
    // Use semantic colors for income/expense patterns
    const kl = key.toLowerCase();
    if (kl.includes("revenu") || kl.includes("income")) barColors[key] = "#10b981";
    else if (kl.includes("dépense") || kl.includes("depense") || kl.includes("expense")) barColors[key] = "#ef4444";
    else barColors[key] = COLORS[i % COLORS.length];
  });

  return (
    <div className="my-3">
      {title && <div className="text-sm font-medium text-muted-foreground mb-2">{title}</div>}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey={labelKey as string} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          {valueKeys.length > 1 && <Legend />}
          {valueKeys.map((key) => (
            <Bar key={key} dataKey={key} fill={barColors[key]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieChartBlock({ data, title }: { data: Record<string, unknown>[]; title?: string }) {
  return (
    <div className="my-3">
      {title && <div className="text-sm font-medium text-muted-foreground mb-2">{title}</div>}
      <div className="flex items-start gap-4">
        <ResponsiveContainer width="50%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={80}
              dataKey="value"
              nameKey="name"
              label={({ name, percentage }) =>
                percentage ? `${percentage}%` : String(name).slice(0, 10)
              }
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1 pt-2">
          {data.slice(0, 8).map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="truncate">{String(item.name || "")}</span>
              <span className="ml-auto font-medium">{formatCurrency(Number(item.value || 0))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AreaChartBlock({ data, title }: { data: Record<string, unknown>[]; title?: string }) {
  const xKey = data[0] && ("date" in data[0] ? "date" : "month" in data[0] ? "month" : "label");
  const valueKey = data[0]
    ? Object.keys(data[0]).find((k) => k !== xKey && typeof data[0][k] === "number") || "value"
    : "value";

  return (
    <div className="my-3">
      {title && <div className="text-sm font-medium text-muted-foreground mb-2">{title}</div>}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="chatAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey={xKey as string} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <Area
            type="monotone"
            dataKey={valueKey}
            stroke="#3b82f6"
            fill="url(#chatAreaGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ChatChart({ chart }: { chart: ChartBlock }) {
  const { type, title, data } = chart;

  if (!data || data.length === 0) return null;

  switch (type) {
    case "kpi":
      return <KPIChart data={data} title={title} />;
    case "bar":
      return <BarChartBlock data={data} title={title} />;
    case "pie":
      return <PieChartBlock data={data} title={title} />;
    case "area":
      return <AreaChartBlock data={data} title={title} />;
    default:
      return null;
  }
}

/**
 * Parse ```chart blocks from markdown text.
 * Returns an array of segments: either text strings or ChartBlock objects.
 */
export function parseChartBlocks(
  text: string
): Array<{ type: "text"; content: string } | { type: "chart"; chart: ChartBlock }> {
  const segments: Array<{ type: "text"; content: string } | { type: "chart"; chart: ChartBlock }> = [];
  const regex = /```chart\s*\n?([\s\S]*?)```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before chart block
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index).trim();
      if (beforeText) {
        segments.push({ type: "text", content: beforeText });
      }
    }

    // Parse chart JSON
    try {
      const chartData = JSON.parse(match[1].trim());
      if (chartData && chartData.type && chartData.data) {
        segments.push({ type: "chart", chart: chartData as ChartBlock });
      }
    } catch {
      // If JSON parsing fails, treat as text
      segments.push({ type: "text", content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last chart
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      segments.push({ type: "text", content: remaining });
    }
  }

  // If no chart blocks found, return the whole text
  if (segments.length === 0 && text.trim()) {
    segments.push({ type: "text", content: text });
  }

  return segments;
}
