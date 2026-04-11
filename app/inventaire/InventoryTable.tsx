"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
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

function buildNationCelteHref(itemName: string) {
  return `https://marchecelte.ca/exchanges?search=${encodeURIComponent(itemName)}`;
}

function getPreviewSeed(itemName: string) {
  return itemName.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getExampleNationCeltePrice(item: InventoryItem) {
  const seed = getPreviewSeed(item.item_name);
  if (seed % 4 === 0) {
    return "-$";
  }

  const base = item.qty_production > 0 ? item.qty_production : (seed % 9) + 4;
  return formatCurrency(base);
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

  const hasDirtyChanges = Object.keys(dirty).length > 0;

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

  // Group by category
  const grouped: Record<string, InventoryItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

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
                  <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Prix Nation Celte</th>
                  <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Prix du marche</th>
                  <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Marche le moins cher</th>
                </tr>
              </thead>
              <tbody>
                {categoryItems.map((item, i) => {
                  const total = item.qty_coffre + item.qty_en_mains + item.qty_production;
                  const itemDirty = dirty[item.item_name];
                  const marketHref = buildMarketSearchHref(item.item_name);
                  const nationCelteHref = buildNationCelteHref(item.item_name);
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
                      <td className="px-5 py-1.5 text-xs align-top min-w-36">
                        <Link
                          href={nationCelteHref}
                          className="text-brand-amber underline underline-offset-2 hover:text-amber-700"
                        >
                          {getExampleNationCeltePrice(item)}
                        </Link>
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
