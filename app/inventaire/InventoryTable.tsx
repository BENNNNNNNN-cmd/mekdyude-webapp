"use client";

import Link from "next/link";
import { useState, useCallback, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { InventoryItem } from "./page";
import { addSolars, createInventoryItem } from "./actions";

const categoryLabels: Record<string, string> = {
  ressource: "Ressources",
  unite: "Unités",
  objet: "Objets",
  influence: "Influences",
};

function formatCurrency(value: number) {
  return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} $`;
}

function buildMarketSearchHref(itemName: string) {
  return `https://marchecelte.ca/prices?search=${encodeURIComponent(itemName)}`;
}

function formatQtyPerLot(qtyPerLot: number) {
  return qtyPerLot > 1 ? ` x${qtyPerLot}` : "";
}

function formatMarketPrice(item: InventoryItem) {
  const summary = item.market_price;
  if (!summary) return "—";

  if (summary.lowPrice === summary.highPrice) {
    return formatCurrency(summary.lowPrice);
  }

  return `Bas ${formatCurrency(summary.lowPrice)} · Moyen ${formatCurrency(summary.averagePrice)} · Haut ${formatCurrency(summary.highPrice)}`;
}

function formatCheapestMarket(item: InventoryItem) {
  const summary = item.market_price;
  if (!summary) return "—";

  return `${summary.cheapestMarketCode} (${formatCurrency(summary.cheapestPrice)}${formatQtyPerLot(summary.cheapestQtyPerLot)})`;
}

function sortInventoryItems(a: InventoryItem, b: InventoryItem) {
  const categoryOrder = a.category.localeCompare(b.category, "fr-CA");
  if (categoryOrder !== 0) return categoryOrder;

  return a.item_name.localeCompare(b.item_name, "fr-CA");
}

function mergeInventoryItem(
  items: InventoryItem[],
  nextItem: Omit<InventoryItem, "market_price">
) {
  const nextKey = nextItem.item_name.toLocaleLowerCase("fr-CA");
  let replaced = false;

  const merged = items.map((item) => {
    if (item.item_name.toLocaleLowerCase("fr-CA") !== nextKey) return item;

    replaced = true;
    return { ...nextItem, market_price: item.market_price ?? null };
  });

  if (!replaced) {
    merged.push({ ...nextItem, market_price: null });
  }

  return merged.sort(sortInventoryItems);
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addMode, setAddMode] = useState<"item" | "solar">("item");
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("ressource");
  const [newQtyCoffre, setNewQtyCoffre] = useState("0");
  const [newQtyEnMains, setNewQtyEnMains] = useState("0");
  const [newQtyProduction, setNewQtyProduction] = useState("0");
  const [newItemNotes, setNewItemNotes] = useState("");
  const [solarAmount, setSolarAmount] = useState("");
  const [solarTarget, setSolarTarget] = useState<"qty_coffre" | "qty_en_mains">("qty_coffre");

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

  const resetNewItemForm = useCallback(() => {
    setNewItemName("");
    setNewItemCategory("ressource");
    setNewQtyCoffre("0");
    setNewQtyEnMains("0");
    setNewQtyProduction("0");
    setNewItemNotes("");
  }, []);

  const addInventoryItem = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (hasDirtyChanges) {
        setError("Sauvegardez ou annulez vos modifications avant d'ajouter un item.");
        return;
      }

      setAdding(true);
      setError(null);

      try {
        const result = await createInventoryItem({
          item_name: newItemName,
          category: newItemCategory,
          qty_coffre: newQtyCoffre,
          qty_en_mains: newQtyEnMains,
          qty_production: newQtyProduction,
          notes: newItemNotes,
        });

        if (!result.ok) {
          setError(result.message);
          return;
        }

        setItems((prev) => mergeInventoryItem(prev, result.item));
        setSelectedCategory(result.item.category);
        setSearchTerm("");
        resetNewItemForm();
        setShowAddPanel(false);
        router.refresh();
      } catch {
        setError("Erreur lors de l'ajout. Veuillez réessayer.");
      } finally {
        setAdding(false);
      }
    },
    [
      hasDirtyChanges,
      newItemCategory,
      newItemName,
      newItemNotes,
      newQtyCoffre,
      newQtyEnMains,
      newQtyProduction,
      resetNewItemForm,
      router,
    ]
  );

  const addSolarAmount = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (hasDirtyChanges) {
        setError("Sauvegardez ou annulez vos modifications avant d'ajouter du Solar.");
        return;
      }

      setAdding(true);
      setError(null);

      try {
        const result = await addSolars({ amount: solarAmount, target: solarTarget });

        if (!result.ok) {
          setError(result.message);
          return;
        }

        setItems((prev) => mergeInventoryItem(prev, result.item));
        setSelectedCategory(result.item.category);
        setSearchTerm("");
        setSolarAmount("");
        setShowAddPanel(false);
        router.refresh();
      } catch {
        setError("Erreur lors de l'ajout du Solar. Veuillez réessayer.");
      } finally {
        setAdding(false);
      }
    },
    [hasDirtyChanges, router, solarAmount, solarTarget]
  );

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
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowAddPanel((current) => !current);
          }}
          disabled={adding || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-sidebar px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sidebar/90 disabled:opacity-50"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Ajouter
        </button>
      </div>

      {showAddPanel && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-serif text-lg font-bold text-foreground">Ajouter à l&apos;inventaire</h2>
            <div className="inline-flex rounded-lg border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setAddMode("item")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  addMode === "item"
                    ? "bg-brand-amber text-white shadow-sm"
                    : "text-foreground/70 hover:bg-parchment-dark"
                }`}
              >
                Carte / item
              </button>
              <button
                type="button"
                onClick={() => setAddMode("solar")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  addMode === "solar"
                    ? "bg-brand-amber text-white shadow-sm"
                    : "text-foreground/70 hover:bg-parchment-dark"
                }`}
              >
                Solar
              </button>
            </div>
          </div>

          {hasDirtyChanges && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              Sauvegardez ou annulez les modifications en cours avant d&apos;ajouter une ligne.
            </p>
          )}

          {addMode === "item" ? (
            <form onSubmit={addInventoryItem} className="mt-4 grid gap-3 md:grid-cols-6">
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground md:col-span-2">
                Nom
                <input
                  type="text"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  value={newItemName}
                  onChange={(event) => setNewItemName(event.target.value)}
                  required
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Section
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
                  value={newItemCategory}
                  onChange={(event) => setNewItemCategory(event.target.value)}
                >
                  {Object.entries(categoryLabels).map(([category, label]) => (
                    <option key={category} value={category}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Coffre
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
                  value={newQtyCoffre}
                  onChange={(event) => setNewQtyCoffre(event.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                En mains
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
                  value={newQtyEnMains}
                  onChange={(event) => setNewQtyEnMains(event.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Production
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
                  value={newQtyProduction}
                  onChange={(event) => setNewQtyProduction(event.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-foreground md:col-span-4">
                Notes
                <input
                  type="text"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  value={newItemNotes}
                  onChange={(event) => setNewItemNotes(event.target.value)}
                />
              </label>

              <div className="flex items-end gap-2 md:col-span-2">
                <button
                  type="button"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-parchment-dark"
                  onClick={() => {
                    resetNewItemForm();
                    setShowAddPanel(false);
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={adding || saving || hasDirtyChanges}
                  className="rounded-lg bg-brand-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-500 disabled:opacity-50"
                >
                  {adding ? "Ajout en cours…" : "Ajouter l'item"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={addSolarAmount} className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Montant
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
                  value={solarAmount}
                  onChange={(event) => setSolarAmount(event.target.value)}
                  required
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
                Ajouter à
                <select
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-amber-300"
                  value={solarTarget}
                  onChange={(event) => setSolarTarget(event.target.value as "qty_coffre" | "qty_en_mains")}
                >
                  <option value="qty_coffre">Coffre</option>
                  <option value="qty_en_mains">En mains</option>
                </select>
              </label>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-parchment-dark"
                  onClick={() => {
                    setSolarAmount("");
                    setShowAddPanel(false);
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={adding || saving || hasDirtyChanges}
                  className="rounded-lg bg-brand-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-500 disabled:opacity-50"
                >
                  {adding ? "Ajout en cours…" : "Ajouter du Solar"}
                </button>
              </div>
            </form>
          )}
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
                  const marketHref = buildMarketSearchHref(item.market_price?.marketItemName ?? item.item_name);
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
                          {formatMarketPrice(item)}
                        </Link>
                      </td>
                      <td className="px-5 py-1.5 text-xs align-top min-w-40">
                        <Link
                          href={marketHref}
                          className="text-brand-amber underline underline-offset-2 hover:text-amber-700"
                          title={item.market_price?.cheapestMarketName}
                        >
                          {formatCheapestMarket(item)}
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
