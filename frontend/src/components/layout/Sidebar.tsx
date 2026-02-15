import { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../utils/cn";
import { useUIStore } from "../../store/ui.store";
import { categoryService } from "../../services/category.service";
import type { Category } from "../../types/category.types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: "Tableau de bord",
    href: "/dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: "Comptes",
    href: "/accounts",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
  {
    label: "Transactions",
    href: "/transactions",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    label: "Classification",
    href: "/classification",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    label: "Analyses",
    href: "/analytics",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    label: "Assistant IA",
    href: "/ai-chat",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
];

const categoriesIcon = (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 6h.008v.008H6V6z" />
  </svg>
);

export function Sidebar() {
  const { sidebarOpen } = useUIStore();
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [addingToParentId, setAddingToParentId] = useState<number | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const data = await categoryService.list();
      setCategories(data);
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (categoriesOpen && sidebarOpen) fetchCategories();
  }, [categoriesOpen, sidebarOpen, fetchCategories]);

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSub = async (parentId: number) => {
    const name = newSubName.trim();
    if (!name) return;
    try {
      await categoryService.create({ name, parent_id: parentId });
      setNewSubName("");
      setAddingToParentId(null);
      await fetchCategories();
      setExpandedIds((prev) => new Set(prev).add(parentId));
    } catch {
      // ignore
    }
  };

  const handleAddRoot = async () => {
    const name = newSubName.trim();
    if (!name) return;
    try {
      await categoryService.create({ name });
      setNewSubName("");
      setAddingToParentId(null);
      await fetchCategories();
    } catch {
      // ignore
    }
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r bg-card transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            MF
          </div>
          {sidebarOpen && <span className="text-lg font-semibold">MyFinance</span>}
        </div>
      </div>

      {/* Nav + Categories : nav en haut, panel catégories occupe le reste avec scroll */}
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {/* Navigation */}
        <nav className="shrink-0 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  !sidebarOpen && "justify-center px-2"
                )
              }
              title={!sidebarOpen ? item.label : undefined}
            >
              {item.icon}
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Accordion Catégories — occupe la place restante, scroll si trop long */}
        {sidebarOpen && (
          <div className="mt-3 flex min-h-0 flex-1 flex-col border-t pt-3">
            <button
              type="button"
              onClick={() => setCategoriesOpen(!categoriesOpen)}
              className="flex w-full shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {categoriesIcon}
              <span>Catégories</span>
              <svg
                className={cn("ml-auto w-4 h-4 transition-transform", categoriesOpen && "rotate-180")}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {categoriesOpen && (
              <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto pl-1">
                <div className="space-y-0.5">
                {loading ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Chargement…</p>
                ) : (
                  <>
                    {categories.map((cat) => (
                      <CategoryNode
                        key={cat.id}
                        category={cat}
                        depth={0}
                        expandedIds={expandedIds}
                        onToggle={toggleExpanded}
                        addingToParentId={addingToParentId}
                        newSubName={newSubName}
                        setNewSubName={setNewSubName}
                        onStartAdd={setAddingToParentId}
                        onAddSub={handleAddSub}
                        onAddRoot={handleAddRoot}
                      />
                    ))}
                    {addingToParentId === null && (
                      <div className="flex items-center gap-1 px-3 py-1">
                        <input
                          type="text"
                          placeholder="Nouvelle catégorie (racine)"
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddRoot();
                            if (e.key === "Escape") setNewSubName("");
                          }}
                          className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => newSubName.trim() && handleAddRoot()}
                          className="shrink-0 rounded p-1 text-primary hover:bg-primary/10"
                          title="Ajouter à la racine"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </>
                )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings at bottom */}
      <div className="shrink-0 p-3 border-t">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              !sidebarOpen && "justify-center px-2"
            )
          }
          title={!sidebarOpen ? "Parametres" : undefined}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {sidebarOpen && <span>Parametres</span>}
        </NavLink>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Category tree node (recursive)
// ---------------------------------------------------------------------------

interface CategoryNodeProps {
  category: Category;
  depth: number;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  addingToParentId: number | null;
  newSubName: string;
  setNewSubName: (v: string) => void;
  onStartAdd: (parentId: number | null) => void;
  onAddSub: (parentId: number, name: string) => void;
  onAddRoot: () => void;
}

function CategoryNode({
  category,
  depth,
  expandedIds,
  onToggle,
  addingToParentId,
  newSubName,
  setNewSubName,
  onStartAdd,
  onAddSub,
  onAddRoot,
}: CategoryNodeProps) {
  const hasChildren = category.children && category.children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const isAddingHere = addingToParentId === category.id;

  return (
    <div className="space-y-0.5">
      <div
        className={cn(
          "flex items-center gap-1 rounded px-2 py-1 text-xs group",
          depth > 0 && "ml-3"
        )}
        style={depth > 0 ? { paddingLeft: `${8 + depth * 12}px` } : undefined}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(category.id)}
          className="shrink-0 p-0.5 rounded hover:bg-muted"
        >
          {hasChildren ? (
            <svg
              className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <span className="w-3.5 inline-block" />
          )}
        </button>
        <span className={cn("flex-1 truncate", category.is_system && "text-muted-foreground")}>
          {category.name}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartAdd(category.id);
            setNewSubName("");
          }}
          className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-primary"
          title="Ajouter une sous-catégorie"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Inline add sub-category */}
      {isAddingHere && (
        <div className="flex items-center gap-1 pl-6 py-1" style={depth > 0 ? { paddingLeft: `${14 + depth * 12}px` } : undefined}>
          <input
            type="text"
            placeholder="Nom de la sous-catégorie"
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddSub(category.id, newSubName.trim());
              if (e.key === "Escape") onStartAdd(null);
            }}
            autoFocus
            className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => newSubName.trim() && onAddSub(category.id, newSubName.trim())}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Ajouter
          </button>
        </div>
      )}

      {isExpanded && hasChildren && category.children && (
        <div className="space-y-0.5">
          {category.children.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              addingToParentId={addingToParentId}
              newSubName={newSubName}
              setNewSubName={setNewSubName}
              onStartAdd={onStartAdd}
              onAddSub={onAddSub}
              onAddRoot={onAddRoot}
            />
          ))}
        </div>
      )}
    </div>
  );
}
