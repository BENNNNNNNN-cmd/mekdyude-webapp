"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { InventoryItem } from "./page";

const categoryLabels: Record<string, string> = {
  ressource: "Ressources",
  unite: "Unités",
  objet: "Objets",
  influence: "Influences",
};

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
        className="w-20 px-2 py-1 text-sm text-right border border-amber-400 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
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
      className={`w-20 px-2 py-1 text-sm text-right rounded hover:bg-amber-50 hover:ring-1 hover:ring-amber-200 cursor-pointer transition-colors ${isDirty ? "bg-amber-100 ring-1 ring-amber-300 font-semibold" : ""}`}
      onClick={() => {
        setDraft(value.toString());
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}

type DirtyChanges = Record<string, { qty_coffre?: number; qty_en_mains?: number }>;

export default function InventoryTable({ initialItems }: { initialItems: InventoryItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [dirty, setDirty] = useState<DirtyChanges>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDirtyChanges = Object.keys(dirty).length > 0;

  const updateItem = useCallback(
    (itemName: string, field: "qty_coffre" | "qty_en_mains", newValue: number) => {
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
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
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
                </tr>
              </thead>
              <tbody>
                {categoryItems.map((item, i) => {
                  const total = item.qty_coffre + item.qty_en_mains + item.qty_production;
                  const itemDirty = dirty[item.item_name];
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
                      <td className="px-5 py-1.5 text-foreground/50 text-xs max-w-48 truncate">{item.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {hasDirtyChanges && (
        <div className="sticky bottom-6 flex justify-center">
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-6 py-3 bg-brand-amber text-foreground font-semibold rounded-lg shadow-lg hover:bg-amber-500 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? "Sauvegarde en cours…" : "Sauvegarder"}
          </button>
        </div>
      )}
    </div>
  );
}
