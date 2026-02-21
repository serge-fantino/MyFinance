/**
 * Query builder — UX form and JSON modes, synced.
 * Uses metamodel for field/operator suggestions.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Metamodel, MetamodelSource } from "../../services/query.service";

export interface QueryState {
  source: string;
  fields?: string[];
  filters?: Array<{ field: string; op: string; value: unknown }>;
  groupBy?: string[];
  aggregates?: Array<{ fn: string; field?: string; as?: string }>;
  orderBy?: Array<{ field: string; dir: string }>;
  limit?: number;
}

const DEFAULT_QUERY: QueryState = {
  source: "transactions",
  filters: [],
  groupBy: [],
  aggregates: [],
  orderBy: [],
};

/** Get all field refs for a source (direct + relations) */
function getFieldOptions(source: MetamodelSource | undefined, metamodel: Metamodel | null): Array<{ ref: string; label: string; desc?: string }> {
  if (!source) return [];
  const opts: Array<{ ref: string; label: string; desc?: string }> = [];
  for (const f of source.fields || []) {
    opts.push({ ref: f.name, label: f.name, desc: f.description });
  }
  for (const rel of source.relations || []) {
    const target = metamodel?.sources?.find((s) => s.name === rel.target);
    for (const f of target?.fields || []) {
      const ref = `${rel.target}.${f.name}`;
      opts.push({ ref, label: ref, desc: f.description });
    }
  }
  return opts;
}

/** Temporal options for groupBy (month(date), etc.) */
function getTemporalOptions(metamodel: Metamodel | null): Array<{ ref: string; label: string }> {
  const fns = metamodel?.temporal_functions || ["month", "quarter", "year", "week", "day"];
  const temporalFields = ["date"];
  const opts: Array<{ ref: string; label: string }> = [];
  for (const fn of fns) {
    for (const tf of temporalFields) {
      opts.push({ ref: `${fn}(${tf})`, label: `${fn}(${tf})` });
    }
  }
  return opts;
}

function QueryBuilder({
  query,
  onChange,
  metamodel,
  mode,
  onModeChange,
}: {
  query: QueryState;
  onChange: (q: QueryState) => void;
  metamodel: Metamodel | null;
  mode: "ux" | "json";
  onModeChange: (m: "ux" | "json") => void;
}) {
  const [jsonStr, setJsonStr] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const sourceDef = metamodel?.sources?.find((s) => s.name === query.source);
  const fieldOpts = getFieldOptions(sourceDef, metamodel);
  const temporalOpts = getTemporalOptions(metamodel);
  const allFieldOpts = [...fieldOpts, ...temporalOpts.map((t) => ({ ref: t.ref, label: t.ref, desc: undefined }))];

  // Sync JSON when query changes (from parent or UX edits)
  useEffect(() => {
    setJsonStr(JSON.stringify(query, null, 2));
    setJsonError(null);
  }, [query]);

  const update = useCallback(
    (patch: Partial<QueryState>) => {
      onChange({ ...query, ...patch });
    },
    [query, onChange]
  );

  const handleJsonBlur = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonStr) as QueryState;
      if (parsed.source) {
        onChange(parsed);
        setJsonError(null);
      }
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON invalide");
    }
  }, [jsonStr, onChange]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-sm font-medium">Query</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onModeChange("ux")}
            className={`px-2 py-1 text-[11px] rounded ${mode === "ux" ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
          >
            Formulaire
          </button>
          <button
            type="button"
            onClick={() => onModeChange("json")}
            className={`px-2 py-1 text-[11px] rounded ${mode === "json" ? "bg-primary/20 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
          >
            JSON
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {mode === "json" ? (
          <div>
            <textarea
              value={jsonStr}
              onChange={(e) => setJsonStr(e.target.value)}
              onBlur={handleJsonBlur}
              className="w-full min-h-[200px] p-2 text-xs font-mono bg-background border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              spellCheck={false}
            />
            {jsonError && <p className="text-xs text-red-600 mt-1">{jsonError}</p>}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Source */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Source</label>
              <select
                value={query.source}
                onChange={(e) => update({ source: e.target.value })}
                className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
              >
                {metamodel?.sources?.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} — {s.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode: fields vs groupBy+aggregates */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!!query.fields?.length && !query.groupBy?.length}
                  onChange={() => {
                    const defaults = fieldOpts.slice(0, 4).map((o) => o.ref);
                    update({ fields: defaults.length ? defaults : ["date"], groupBy: [], aggregates: [] });
                  }}
                />
                <span className="text-xs">Liste (fields)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!!query.groupBy?.length || !!query.aggregates?.length}
                  onChange={() => {
                    const gb = query.groupBy?.length ? query.groupBy : (fieldOpts.find((o) => o.ref.includes("category"))?.ref ? ["category.name"] : [fieldOpts[0]?.ref || "date"]);
                    const agg = query.aggregates?.length ? query.aggregates : [{ fn: "sum", field: fieldOpts.find((o) => o.ref === "amount")?.ref || "amount", as: "total" }];
                    update({ fields: [], groupBy: gb, aggregates: agg });
                  }}
                />
                <span className="text-xs">Agrégation (groupBy)</span>
              </label>
            </div>

            {query.fields && query.fields.length > 0 ? (
              /* Fields (simple mode) */
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Champs</label>
                <div className="flex flex-wrap gap-1">
                  {fieldOpts.map((opt) => (
                    <button
                      key={opt.ref}
                      type="button"
                      onClick={() => {
                        const current = query.fields || [];
                        const next = current.includes(opt.ref) ? current.filter((x) => x !== opt.ref) : [...current, opt.ref];
                        update({ fields: next });
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        query.fields?.includes(opt.ref) ? "bg-primary/20 border-primary" : "hover:bg-muted"
                      }`}
                      title={opt.desc}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* GroupBy */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">GroupBy</label>
                  <div className="space-y-1">
                    {(query.groupBy || []).map((g, i) => (
                      <div key={i} className="flex gap-1">
                        <select
                          value={g}
                          onChange={(e) => {
                            const next = [...(query.groupBy || [])];
                            next[i] = e.target.value;
                            update({ groupBy: next });
                          }}
                          className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
                        >
                          {allFieldOpts.map((opt) => (
                            <option key={opt.ref} value={opt.ref}>
                              {opt.ref}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => update({ groupBy: (query.groupBy || []).filter((_, j) => j !== i) })}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => update({ groupBy: [...(query.groupBy || []), allFieldOpts[0]?.ref || "category.name"] })}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3 h-3" /> Ajouter
                    </button>
                  </div>
                </div>

                {/* Aggregates */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Agrégats</label>
                  <div className="space-y-1">
                    {(query.aggregates || []).map((a, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <select
                          value={a.fn}
                          onChange={(e) => {
                            const next = [...(query.aggregates || [])];
                            next[i] = { ...next[i], fn: e.target.value };
                            update({ aggregates: next });
                          }}
                          className="w-24 rounded border border-input bg-background px-2 py-1 text-xs"
                        >
                          {metamodel?.aggregate_functions?.map((fn) => (
                            <option key={fn} value={fn}>{fn}</option>
                          ))}
                        </select>
                        <select
                          value={a.field || ""}
                          onChange={(e) => {
                            const next = [...(query.aggregates || [])];
                            next[i] = { ...next[i], field: e.target.value || undefined };
                            update({ aggregates: next });
                          }}
                          className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
                        >
                          <option value="">—</option>
                          {fieldOpts.filter((f) => f.ref !== "direction").map((opt) => (
                            <option key={opt.ref} value={opt.ref}>{opt.ref}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={a.as || ""}
                          onChange={(e) => {
                            const next = [...(query.aggregates || [])];
                            next[i] = { ...next[i], as: e.target.value || undefined };
                            update({ aggregates: next });
                          }}
                          placeholder="alias"
                          className="w-20 rounded border border-input bg-background px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => update({ aggregates: (query.aggregates || []).filter((_, j) => j !== i) })}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => update({ aggregates: [...(query.aggregates || []), { fn: "sum", field: "amount", as: "total" }] })}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3 h-3" /> Ajouter
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Filters */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Filtres</label>
              <div className="space-y-1">
                {(query.filters || []).map((f, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <select
                      value={f.field}
                      onChange={(e) => {
                        const next = [...(query.filters || [])];
                        next[i] = { ...next[i], field: e.target.value };
                        update({ filters: next });
                      }}
                      className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1 text-xs"
                    >
                      {allFieldOpts.map((opt) => (
                        <option key={opt.ref} value={opt.ref}>{opt.ref}</option>
                      ))}
                    </select>
                    <select
                      value={f.op}
                      onChange={(e) => {
                        const next = [...(query.filters || [])];
                        next[i] = { ...next[i], op: e.target.value };
                        update({ filters: next });
                      }}
                      className="w-20 rounded border border-input bg-background px-2 py-1 text-xs"
                    >
                      {metamodel?.filter_operators?.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                    {f.op === "period" ? (
                      <select
                        value={String(f.value)}
                        onChange={(e) => {
                          const next = [...(query.filters || [])];
                          next[i] = { ...next[i], value: e.target.value };
                          update({ filters: next });
                        }}
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
                      >
                        {Object.entries(metamodel?.period_macros || {}).map(([k, v]) => (
                          <option key={k} value={k}>{k} — {v}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={String(f.value ?? "")}
                        onChange={(e) => {
                          const next = [...(query.filters || [])];
                          const val = e.target.value;
                          next[i] = { ...next[i], value: /^-?\d+$/.test(val) ? parseInt(val, 10) : val };
                          update({ filters: next });
                        }}
                        placeholder="valeur"
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => update({ filters: (query.filters || []).filter((_, j) => j !== i) })}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => update({ filters: [...(query.filters || []), { field: "date", op: "period", value: "last_12_months" }] })}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3 h-3" /> Ajouter filtre
                </button>
              </div>
            </div>

            {/* OrderBy */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tri</label>
              <div className="space-y-1">
                {(query.orderBy || []).map((o, i) => (
                  <div key={i} className="flex gap-1">
                    <select
                      value={o.field}
                      onChange={(e) => {
                        const next = [...(query.orderBy || [])];
                        next[i] = { ...next[i], field: e.target.value };
                        update({ orderBy: next });
                      }}
                      className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
                    >
                      {allFieldOpts.map((opt) => (
                        <option key={opt.ref} value={opt.ref}>{opt.ref}</option>
                      ))}
                      {(query.aggregates || []).map((a) => a.as).filter(Boolean).map((as) => (
                        <option key={as} value={as!}>{as}</option>
                      ))}
                    </select>
                    <select
                      value={o.dir}
                      onChange={(e) => {
                        const next = [...(query.orderBy || [])];
                        next[i] = { ...next[i], dir: e.target.value };
                        update({ orderBy: next });
                      }}
                      className="w-20 rounded border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="asc">asc</option>
                      <option value="desc">desc</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => update({ orderBy: (query.orderBy || []).filter((_, j) => j !== i) })}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => update({ orderBy: [...(query.orderBy || []), { field: "month", dir: "asc" }] })}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3 h-3" /> Ajouter
                </button>
              </div>
            </div>

            {/* Limit */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Limit</label>
              <input
                type="number"
                value={query.limit ?? ""}
                onChange={(e) => update({ limit: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                placeholder="optionnel"
                className="w-24 rounded border border-input bg-background px-2 py-1 text-xs"
                min={1}
                max={1000}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default QueryBuilder;
export type { QueryState };
