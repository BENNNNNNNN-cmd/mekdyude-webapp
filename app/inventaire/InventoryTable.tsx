"use client";

import Link from "next/link";
import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { InventoryItem } from "./page";

const categoryLabels: Record<string, string> = {
  ressource: "Ressources",
  unite: "Unités",
  objet: "Objets",
  influence: "Influences",
};

function formatCurrency(value: number) {
  return `${value.toLocaleString("fr-CA")} $`;
}

function buildMarketSearchHref(itemName: string) {
  return `https://marchecelte.ca/prices?search=${encodeURIComponent(itemName)}`;
}

function getPreviewSeed(itemName: string) {
  return itemName.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getExampleMarketPrice(item: InventoryItem) {
  const seed = getPreviewSeed(item.item_name);
  const low = (seed % 8) + 3;
  const average = low + 3;
  const high = average + 4;

  return `Bas ${formatCurrency(low)} · Moyen ${formatCurrency(average)} · Eleve ${formatCurrency(high)}`;
}

function getExampleCheapestMarket(item: InventoryItem) {
  const seed = getPreviewSeed(item.item_name);
  const comptoirs = ["CCMO", "KMO", "Auberge", "Bastion"];
  const comptoir = comptoirs[seed % comptoirs.length];
  const price = (seed % 8) + 3;

  return `${comptoir} (${formatCurrency(price)})`;
}

function EditableCell({
  value,
  isDirty,
  onSave,
}: {
  value: number;
  isDirty: boolean;
  onSave: (newValue: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toString());

  const commit = useCallback(() => {
    setEditing(false);
    const parsed = parseInt(draft);
    if (!isNaN(parsed) && parsed !== value) {
      onSave(parsed);
    } else {
      setDraft(value.toString());
    }
  }, [draft, value, onSave]);

  if (editing) {
    return (
      <input
        type="number"
        className="w-20 px-2 py-1 text-sm text-right border border-amber-400 rounded bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value.toString());
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      className={`w-20 px-2 py-1 text-sm text-right rounded hover:bg-parchment-dark hover:ring-1 hover:ring-amber-200 cursor-pointer transition-colors ${isDirty ? "bg-amber-100 ring-1 ring-amber-300 font-semibold" : ""}`}
      onClick={() => {
        setDraft(value.toString());
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}

function EditableNotesCell({
  value,
  isDirty,
  onSave,
}: {
  value: string | null;
  isDirty: boolean;
  onSave: (newValue: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = useCallback(() => {
    setEditing(false);
    const normalized = draft.trim();
    const nextValue = normalized.length > 0 ? normalized : null;
    if (nextValue !== value) {
      onSave(nextValue);
    } else {
      setDraft(value ?? "");
    }
  }, [draft, onSave, value]);

  if (editing) {
    return (
      <textarea
        className="min-h-20 w-full min-w-48 rounded border border-amber-400 bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      className={`block min-h-8 w-full rounded px-2 py-1 text-left text-xs transition-colors hover:bg-parchment-dark hover:ring-1 hover:ring-amber-200 ${isDirty ? "bg-amber-100 ring-1 ring-amber-300 font-semibold text-foreground" : "text-foreground/50"}`}
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
    >
      {value || "—"}
    </button>
  );
}

type DirtyChanges = Record<string, { qty_coffre?: number; qty_en_mains?: number; notes?: string | null }>;

export default function InventoryTable({ initialItems }: { initialItems: InventoryItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [dirty, setDirty] = useState<DirtyChanges>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const hasDirtyChanges = Object.keys(dirty).length > 0;
  const hasActiveFilters = selectedCategory !== "all" || searchTerm.trim().length > 0;

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    return items.reduce<string[]>((options, item) => {
      if (!seen.has(item.category)) {
        seen.add(item.category);
        options.push(item.category);
      }
      return options;
    }, []);
  }, [items]);

  const updateItem = useCallback(
    (
      itemName: string,
      field: "qty_coffre" | "qty_en_mains" | "notes",
      newValue: number | string | null
    ) => {
      setItems((prev) =>
        prev.map((item) =>
          item.item_name === itemName ? { ...item, [field]: newValue } : item
        )
      );
      setDirty((prev) => ({
        ...prev,
        [itemName]: { ...prev[itemName], [field]: newValue },
      }));
    },
    []
  );

  const saveAll = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const entries = Object.entries(dirty);
      await Promise.all(
        entries.map(([itemName, fields]) =>
          fetch("/api/inventory", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_name: itemName, ...fields }),
          }).then((res) => {
            if (!res.ok) throw new Error(`Erreur pour ${itemName}`);
          })
        )
      );
      setDirty({});
      router.refresh();
    } catch {
      setError("Erreur lors de la sauvegarde. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  }, [dirty, router]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("fr-CA");

    return items.filter((item) => {
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        item.item_name.toLocaleLowerCase("fr-CA").includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [items, searchTerm, selectedCategory]);

  const grouped = useMemo(() => {
    return filteredItems.reduce<Record<string, InventoryItem[]>>((groups, item) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
      return groups;
    }, {});
  }, [filteredItems]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Donnees Marche Nation Celte a venir. Les valeurs affichees dans les colonnes de prix sont
        des exemples visuels seulement.
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-foreground">
          Section
          <select
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">Toutes les sections</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {categoryLabels[category] || category}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-[2] flex-col gap-1 text-sm font-medium text-foreground">
          Recherche
          <input
            type="search"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-amber-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher un item"
          />
        </label>

        <div className="flex items-center gap-3 md:pb-0.5">
          <span className="text-sm text-foreground/60">
            {filteredItems.length} item{filteredItems.length > 1 ? "s" : ""}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-parchment-dark"
              onClick={() => {
                setSelectedCategory("all");
                setSearchTerm("");
              }}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {filteredItems.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-5 py-6 text-sm text-foreground/60">
          Aucun item ne correspond aux filtres.
        </div>
      )}

      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-parchment-dark/50 border-b border-border">
            <h2 className="font-serif text-lg font-bold">{categoryLabels[category] || category}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Item</th>
                  <th className="px-5 py-2.5 text-right text-xs uppercase tracking-wider text-foreground/60">Coffre</th>
                  <th className="px-5 py-2.5 text-right text-xs uppercase tracking-wider text-foreground/60">En mains</th>
                  <th className="px-5 py-2.5 text-right text-xs uppercase tracking-wider text-foreground/60">Production</th>
                  <th className="px-5 py-2.5 text-right text-xs uppercase tracking-wider text-foreground/60 font-bold">Total</th>
                  <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Notes</th>
                  <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Prix du marche</th>
                  <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Marche le moins cher</th>
                </tr>
              </thead>
              <tbody>
                {categoryItems.map((item, i) => {
                  const total = item.qty_coffre + item.qty_en_mains + item.qty_production;
                  const itemDirty = dirty[item.item_name];
                  const marketHref = buildMarketSearchHref(item.item_name);
                  return (
                    <tr key={item.item_name} className={i % 2 === 0 ? "bg-card" : "bg-parchment/30"}>
                      <td className="px-5 py-1.5 font-medium">{item.item_name}</td>
                      <td className="px-5 py-1.5 text-right">
                        <EditableCell
                          value={item.qty_coffre}
                          isDirty={itemDirty?.qty_coffre !== undefined}
                          onSave={(v) => updateItem(item.item_name, "qty_coffre", v)}
                        />
                      </td>
                      <td className="px-5 py-1.5 text-right">
                        <EditableCell
                          value={item.qty_en_mains}
                          isDirty={itemDirty?.qty_en_mains !== undefined}
                          onSave={(v) => updateItem(item.item_name, "qty_en_mains", v)}
                        />
                      </td>
                      <td className="px-5 py-1.5 text-right text-foreground/60">{item.qty_production}</td>
                      <td className="px-5 py-1.5 text-right font-bold">{total}</td>
                      <td className="px-5 py-1.5 max-w-64 align-top">
                        <EditableNotesCell
                          value={item.notes}
                          isDirty={itemDirty?.notes !== undefined}
                          onSave={(v) => updateItem(item.item_name, "notes", v)}
                        />
                      </td>
                      <td className="px-5 py-1.5 text-xs align-top min-w-56">
                        <Link
                          href={marketHref}
                          className="text-brand-amber underline underline-offset-2 hover:text-amber-700"
                        >
                          {getExampleMarketPrice(item)}
                        </Link>
                      </td>
                      <td className="px-5 py-1.5 text-xs align-top min-w-40">
                        <Link
                          href={marketHref}
                          className="text-brand-amber underline underline-offset-2 hover:text-amber-700"
                        >
                          {getExampleCheapestMarket(item)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {hasDirtyChanges && (
        <div className="sticky bottom-6 flex justify-center gap-3">
          <button
            onClick={() => {
              setDirty({});
              setItems(initialItems);
            }}
            disabled={saving}
            className="px-6 py-3 bg-gray-500 text-white font-semibold rounded-lg shadow-lg hover:bg-gray-600 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-6 py-3 bg-brand-amber text-white font-semibold rounded-lg shadow-lg hover:bg-amber-500 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? "Sauvegarde en cours…" : "Sauvegarder"}
          </button>
        </div>
      )}
    </div>
  );
}
