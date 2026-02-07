import { useEffect, useState, useCallback } from "react";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { categoryService } from "../../services/category.service";
import { ruleService } from "../../services/rule.service";
import type { Category } from "../../types/category.types";
import type { ClassificationRule } from "../../types/rule.types";

export default function SettingsPage() {
  const [tab, setTab] = useState<"categories" | "rules">("categories");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground mt-1">
          Gérez vos catégories et règles de classification.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["categories", "rules"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "categories" ? "Catégories" : "Règles de classification"}
          </button>
        ))}
      </div>

      {tab === "categories" && <CategoriesManager />}
      {tab === "rules" && <RulesManager />}
    </div>
  );
}

/* ===========================================================================
   Categories Manager
   =========================================================================== */

function CategoriesManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatParent, setNewCatParent] = useState<string>("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const data = await categoryService.list();
      setCategories(data);
    } catch {
      setError("Impossible de charger les catégories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Build flat list for parent dropdown
  const flatCats: { id: number; name: string; depth: number; is_system: boolean }[] = [];
  const walk = (cats: Category[], depth: number) => {
    for (const cat of cats) {
      flatCats.push({ id: cat.id, name: cat.name, depth, is_system: cat.is_system });
      if (cat.children?.length) walk(cat.children, depth + 1);
    }
  };
  walk(categories, 0);

  const handleAdd = async () => {
    if (!newCatName.trim()) return;
    try {
      await categoryService.create({
        name: newCatName.trim(),
        parent_id: newCatParent ? parseInt(newCatParent) : undefined,
      });
      setNewCatName("");
      setNewCatParent("");
      fetchCategories();
    } catch {
      setError("Erreur lors de la création.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette catégorie ?")) return;
    try {
      await categoryService.delete(id);
      fetchCategories();
    } catch {
      setError("Impossible de supprimer (catégorie système ou utilisée).");
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await categoryService.update(editingId, { name: editName.trim() });
      setEditingId(null);
      setEditName("");
      fetchCategories();
    } catch {
      setError("Impossible de modifier (catégorie système).");
    }
  };

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Add category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajouter une catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">Nom</label>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Ex: Abonnements"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div className="w-48">
              <label className="block text-xs font-medium mb-1">Parent</label>
              <select
                value={newCatParent}
                onChange={(e) => setNewCatParent(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">— Racine —</option>
                {flatCats.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {"\u00A0\u00A0".repeat(cat.depth)}{cat.name}
                  </option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={!newCatName.trim()}>
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Category tree */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catégories</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : (
            <div className="space-y-0.5">
              {flatCats.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 group"
                  style={{ paddingLeft: `${cat.depth * 24 + 8}px` }}
                >
                  {editingId === cat.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded border border-input bg-background px-2 py-0.5 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button onClick={handleSaveEdit} className="text-xs text-primary hover:underline">
                        OK
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:underline">
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm">
                        {cat.name}
                        {cat.is_system && (
                          <span className="ml-2 text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5">
                            système
                          </span>
                        )}
                      </span>
                      {!cat.is_system && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingId(cat.id);
                              setEditName(cat.name);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ===========================================================================
   Rules Manager
   =========================================================================== */

function RulesManager() {
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{ pattern: string; category_id: string; custom_label: string; match_type: string }>({
    pattern: "",
    category_id: "",
    custom_label: "",
    match_type: "contains",
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [r, c] = await Promise.all([ruleService.list(), categoryService.list()]);
      setRules(r);
      setCategories(c);
    } catch {
      setError("Impossible de charger les règles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Flat categories for dropdown
  const flatCats: { id: number; name: string; depth: number }[] = [];
  const walkCats = (cats: Category[], depth: number) => {
    for (const cat of cats) {
      flatCats.push({ id: cat.id, name: cat.name, depth });
      if (cat.children?.length) walkCats(cat.children, depth + 1);
    }
  };
  walkCats(categories, 0);

  const handleToggle = async (rule: ClassificationRule) => {
    try {
      await ruleService.update(rule.id, { is_active: !rule.is_active });
      fetchData();
    } catch {
      setError("Erreur lors de la modification.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette règle ?")) return;
    try {
      await ruleService.delete(id);
      fetchData();
    } catch {
      setError("Impossible de supprimer.");
    }
  };

  const handleStartEdit = (rule: ClassificationRule) => {
    setEditingId(rule.id);
    setEditData({
      pattern: rule.pattern,
      category_id: String(rule.category_id),
      custom_label: rule.custom_label || "",
      match_type: rule.match_type,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await ruleService.update(editingId, {
        pattern: editData.pattern,
        category_id: parseInt(editData.category_id),
        custom_label: editData.custom_label || undefined,
        match_type: editData.match_type,
      });
      setEditingId(null);
      fetchData();
    } catch {
      setError("Erreur lors de la modification.");
    }
  };

  const handleApplyAll = async () => {
    try {
      const result = await ruleService.apply();
      if (result.applied > 0) {
        setError(null);
        alert(`${result.applied} transaction(s) classifiée(s) par les règles.`);
      } else {
        alert("Aucune transaction non classée ne correspond aux règles.");
      }
    } catch {
      setError("Erreur lors de l'application des règles.");
    }
  };

  const MATCH_LABELS: Record<string, string> = {
    contains: "contient",
    exact: "exact",
    starts_with: "commence par",
  };

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rules.length} règle(s) — {rules.filter((r) => r.is_active).length} active(s)
        </p>
        <Button variant="outline" size="sm" onClick={handleApplyAll}>
          Appliquer les règles aux transactions non classées
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Chargement...</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Aucune règle. Les règles sont créées automatiquement quand vous classifiez une transaction.
            </p>
          ) : (
            <div className="divide-y">
              {rules.map((rule) => (
                <div key={rule.id} className="py-3 group">
                  {editingId === rule.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium mb-1">Pattern</label>
                          <input
                            type="text"
                            value={editData.pattern}
                            onChange={(e) => setEditData((d) => ({ ...d, pattern: e.target.value }))}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Type</label>
                          <select
                            value={editData.match_type}
                            onChange={(e) => setEditData((d) => ({ ...d, match_type: e.target.value }))}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                          >
                            <option value="contains">Contient</option>
                            <option value="exact">Exact</option>
                            <option value="starts_with">Commence par</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Catégorie</label>
                          <select
                            value={editData.category_id}
                            onChange={(e) => setEditData((d) => ({ ...d, category_id: e.target.value }))}
                            className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                          >
                            {flatCats.map((c) => (
                              <option key={c.id} value={c.id}>
                                {"\u00A0\u00A0".repeat(c.depth)}{c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Libellé personnalisé</label>
                          <input
                            type="text"
                            value={editData.custom_label}
                            onChange={(e) => setEditData((d) => ({ ...d, custom_label: e.target.value }))}
                            placeholder="Ex: Salaire Serge"
                            className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveEdit}>Enregistrer</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Annuler</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${rule.is_active ? "" : "text-muted-foreground line-through"}`}>
                            "{rule.pattern}"
                          </span>
                          <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                            {MATCH_LABELS[rule.match_type] || rule.match_type}
                          </span>
                          <span className="text-xs">→</span>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                            {rule.category_name || `#${rule.category_id}`}
                          </span>
                        </div>
                        {rule.custom_label && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Libellé : "{rule.custom_label}"
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Créée {rule.created_by === "ai" ? "par l'IA" : "manuellement"} le{" "}
                          {new Date(rule.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleToggle(rule)}
                          className={`text-xs px-2 py-0.5 rounded ${
                            rule.is_active
                              ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          }`}
                        >
                          {rule.is_active ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          onClick={() => handleStartEdit(rule)}
                          className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
