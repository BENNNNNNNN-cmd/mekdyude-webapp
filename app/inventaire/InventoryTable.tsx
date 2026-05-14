"use client";

import Link from "next/link";
import { useState, useCallback, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { InventoryItem, InventoryReferenceCarte } from "./page";
import { addSolars, createInventoryItem } from "./actions";
import { Banner, GhostButton, PrimaryButton } from "@/app/components/v3/Banner";
import { Folio } from "@/app/components/v3/Folio";
import { StonePlaque, StonePlaqueGrid } from "@/app/components/v3/StonePlaque";

type InventoryCategory = "ressource" | "unite" | "objet" | "influence";

const categoryLabels: Record<string, string> = {
  ressource: "Ressources",
  unite: "Unités",
  objet: "Objets",
  influence: "Influences",
};

const categoryOrder: Record<string, number> = {
  ressource: 0,
  unite: 1,
  objet: 2,
  influence: 3,
};

const OBJET_FAMILLES = new Set(["Potions & babioles", "Objet magique", "Consommable", "Amélioration"]);

function guessCategoryFromFamille(famille: string): InventoryCategory {
  if (famille.startsWith("Unités") || famille === "Navires") return "unite";
  if (famille.startsWith("Influence")) return "influence";
  if (OBJET_FAMILLES.has(famille)) return "objet";
  return "ressource";
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 2 })} $`;
}

function buildMarketSearchHref(itemName: string) {
  return `https://marchecelte.ca/prices?search=${encodeURIComponent(itemName)}`;
}

function formatInventoryItemName(itemName: string) {
  return itemName.toLocaleLowerCase("fr-CA") === "solaris" ? "Solar" : itemName;
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

  return `${formatCurrency(summary.lowPrice)} · ${formatCurrency(summary.averagePrice)} · ${formatCurrency(summary.highPrice)}`;
}

function formatCheapestMarket(item: InventoryItem) {
  const summary = item.market_price;
  if (!summary) return "—";

  return `${summary.cheapestMarketCode} (${formatCurrency(summary.cheapestPrice)}${formatQtyPerLot(summary.cheapestQtyPerLot)})`;
}

function sortInventoryItems(a: InventoryItem, b: InventoryItem) {
  const orderA = categoryOrder[a.category] ?? 99;
  const orderB = categoryOrder[b.category] ?? 99;
  if (orderA !== orderB) return orderA - orderB;
  return formatInventoryItemName(a.item_name).localeCompare(
    formatInventoryItemName(b.item_name),
    "fr-CA"
  );
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
  bold,
  onSave,
}: {
  value: number;
  isDirty: boolean;
  bold?: boolean;
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
        className="w-20 px-2.5 py-1 text-right font-serif tabular-nums focus:outline-none"
        style={{
          fontSize: bold ? 16 : 14,
          fontWeight: bold ? 700 : 500,
          color: "#1a1008",
          background: "rgba(200,132,42,0.18)",
          border: "1px solid #c8842a",
        }}
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
      type="button"
      title="Cliquer pour modifier"
      className="inline-block min-w-14 px-2.5 py-1 font-serif tabular-nums cursor-pointer transition-colors hover:brightness-105"
      style={{
        fontSize: bold ? 16 : 14,
        fontWeight: bold ? 700 : 500,
        color: isDirty ? "#6e1414" : "#1a1008",
        background: isDirty ? "rgba(200,132,42,0.18)" : "transparent",
        border: isDirty ? "1px dashed #c8842a" : "1px solid transparent",
      }}
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
        className="min-h-16 w-full min-w-44 px-2 py-1 font-serif-body text-xs focus:outline-none"
        style={{
          color: "#1a1008",
          background: "rgba(200,132,42,0.18)",
          border: "1px dashed #c8842a",
        }}
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
      type="button"
      className="block min-h-7 w-full px-2 py-1 text-left text-xs font-serif-body italic transition-colors hover:brightness-105 cursor-pointer"
      style={{
        color: isDirty ? "#6e1414" : value ? "#4a2810" : "#7a5028",
        background: isDirty ? "rgba(200,132,42,0.18)" : "transparent",
        border: isDirty ? "1px dashed #c8842a" : "1px solid transparent",
      }}
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

interface InventoryTableProps {
  initialItems: InventoryItem[];
  referenceCartes: InventoryReferenceCarte[] | null;
  existingItemNamesNormalized: string[];
  referenceError: string | null;
}

type AddMode = "reference" | "custom" | "solar";

export default function InventoryTable({
  initialItems,
  referenceCartes,
  existingItemNamesNormalized,
  referenceError,
}: InventoryTableProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [dirty, setDirty] = useState<DirtyChanges>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>(
    referenceCartes && referenceCartes.length > 0 ? "reference" : "custom"
  );
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("ressource");
  const [newQtyCoffre, setNewQtyCoffre] = useState("0");
  const [newQtyEnMains, setNewQtyEnMains] = useState("0");
  const [newQtyProduction, setNewQtyProduction] = useState("0");
  const [newItemNotes, setNewItemNotes] = useState("");
  const [solarAmount, setSolarAmount] = useState("");
  const [solarTarget, setSolarTarget] = useState<"qty_coffre" | "qty_en_mains">("qty_coffre");
  const [selectedCarteId, setSelectedCarteId] = useState<string | null>(null);
  const [cartePickerSearch, setCartePickerSearch] = useState("");
  const [cartePickerFamille, setCartePickerFamille] = useState<string>("all");

  const existingNameSet = useMemo(
    () => new Set(existingItemNamesNormalized),
    [existingItemNamesNormalized]
  );

  const familleOptions = useMemo(() => {
    if (!referenceCartes) return [] as string[];
    const set = new Set(referenceCartes.map((c) => c.famille));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr-CA"));
  }, [referenceCartes]);

  const filteredCartes = useMemo(() => {
    if (!referenceCartes) return [] as InventoryReferenceCarte[];
    const normalizedSearch = cartePickerSearch.trim().toLocaleLowerCase("fr-CA");
    return referenceCartes.filter((carte) => {
      const matchesFamille = cartePickerFamille === "all" || carte.famille === cartePickerFamille;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        carte.nameFr.toLocaleLowerCase("fr-CA").includes(normalizedSearch);
      return matchesFamille && matchesSearch;
    });
  }, [referenceCartes, cartePickerSearch, cartePickerFamille]);

  const selectedCarte = useMemo(
    () => referenceCartes?.find((c) => c.id === selectedCarteId) ?? null,
    [referenceCartes, selectedCarteId]
  );

  const hasDirtyChanges = Object.keys(dirty).length > 0;
  const dirtyCount = Object.keys(dirty).length;

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    return items
      .reduce<string[]>((options, item) => {
        if (!seen.has(item.category)) {
          seen.add(item.category);
          options.push(item.category);
        }
        return options;
      }, [])
      .sort((a, b) => (categoryOrder[a] ?? 99) - (categoryOrder[b] ?? 99));
  }, [items]);

  // Stat-plaque computed values
  const stats = useMemo(() => {
    const solarItem = items.find(
      (it) => it.item_name.toLocaleLowerCase("fr-CA") === "solar"
    );
    const solarCoffre = solarItem?.qty_coffre ?? 0;
    const solarEnMains = solarItem?.qty_en_mains ?? 0;
    const distinctCount = items.length;
    const totalProduction = items.reduce((sum, it) => sum + it.qty_production, 0);
    const marketValue = items.reduce((sum, it) => {
      const price = it.market_price?.averagePrice ?? 0;
      return sum + (it.qty_coffre + it.qty_en_mains) * price;
    }, 0);
    return { solarCoffre, solarEnMains, distinctCount, totalProduction, marketValue };
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
    setSelectedCarteId(null);
    setCartePickerSearch("");
    setCartePickerFamille("all");
  }, []);

  const selectCarte = useCallback((carte: InventoryReferenceCarte) => {
    setSelectedCarteId(carte.id);
    setNewItemCategory(guessCategoryFromFamille(carte.famille));
    setNewQtyCoffre("0");
    setNewQtyEnMains("0");
    setNewQtyProduction("0");
    setNewItemNotes("");
    setError(null);
  }, []);

  const switchAddMode = useCallback((mode: AddMode) => {
    setAddMode(mode);
    setError(null);
    setSelectedCarteId(null);
    setCartePickerSearch("");
    setCartePickerFamille("all");
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

  const addReferenceCarte = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedCarte) return;
      if (hasDirtyChanges) {
        setError("Sauvegardez ou annulez vos modifications avant d'ajouter un item.");
        return;
      }

      setAdding(true);
      setError(null);

      try {
        const result = await createInventoryItem({
          item_name: selectedCarte.nameFr,
          category: newItemCategory,
          qty_coffre: newQtyCoffre,
          qty_en_mains: newQtyEnMains,
          qty_production: newQtyProduction,
          notes: newItemNotes,
          reference_carte_id: selectedCarte.id,
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
      newItemNotes,
      newQtyCoffre,
      newQtyEnMains,
      newQtyProduction,
      resetNewItemForm,
      router,
      selectedCarte,
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

  const deleteItem = useCallback(
    async (itemName: string) => {
      if (hasDirtyChanges) {
        setError("Sauvegardez ou annulez vos modifications avant de supprimer un item.");
        return;
      }

      const displayItemName = formatInventoryItemName(itemName);
      if (!window.confirm(`Supprimer ${displayItemName} de l'inventaire?`)) {
        return;
      }

      setDeletingItem(itemName);
      setError(null);

      try {
        const response = await fetch("/api/inventory", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_name: itemName }),
        });

        if (!response.ok) {
          setError("Impossible de supprimer cet item. Veuillez réessayer.");
          return;
        }

        setItems((prev) => prev.filter((item) => item.item_name !== itemName));
        router.refresh();
      } catch {
        setError("Erreur lors de la suppression. Veuillez réessayer.");
      } finally {
        setDeletingItem(null);
      }
    },
    [hasDirtyChanges, router]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("fr-CA");

    return items.filter((item) => {
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      const displayItemName = formatInventoryItemName(item.item_name);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        displayItemName.toLocaleLowerCase("fr-CA").includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [items, searchTerm, selectedCategory]);

  const grouped = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {};
    for (const item of filteredItems) {
      (groups[item.category] ??= []).push(item);
    }
    return Object.entries(groups).sort(
      ([a], [b]) => (categoryOrder[a] ?? 99) - (categoryOrder[b] ?? 99)
    );
  }, [filteredItems]);

  return (
    <>
      <Banner
        title="Inventaire"
        sub="Coffre du clan · stock en mains · production saisonnière"
        actions={
          <>
            <GhostButton type="button">↓ Exporter</GhostButton>
            <PrimaryButton
              type="button"
              onClick={() => {
                setError(null);
                setShowAddPanel((cur) => !cur);
              }}
            >
              † Ajouter un item
            </PrimaryButton>
          </>
        }
      />

      <StonePlaqueGrid cols={4}>
        <StonePlaque
          label="Solar — Coffre"
          value={stats.solarCoffre.toLocaleString("fr-CA")}
          sub={`+ ${stats.solarEnMains.toLocaleString("fr-CA")} en mains`}
          valueColor="#c8842a"
        />
        <StonePlaque
          label="Items distincts"
          value={stats.distinctCount}
          sub={`en ${categoryOptions.length} section${categoryOptions.length !== 1 ? "s" : ""}`}
        />
        <StonePlaque
          label="Production / saison"
          value={stats.totalProduction}
          sub="unités diverses"
          valueColor="#7fb15c"
        />
        <StonePlaque
          label="Valeur marché"
          value={Math.round(stats.marketValue).toLocaleString("fr-CA")}
          sub="Solar estimés"
          valueColor="#f4ead2"
        />
      </StonePlaqueGrid>

      {error && (
        <div
          className="mb-3 px-4 py-3 text-sm font-serif-body italic"
          style={{
            background: "rgba(139,32,32,0.15)",
            border: "1px solid #8B1A1A",
            color: "#f4ead2",
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Toolbar */}
      <div
        className="flex items-center gap-2.5 px-4 py-3"
        style={{
          background: "linear-gradient(180deg, #2a1a08, #1a0e05)",
          border: "2px solid #4a2810",
          borderBottom: "none",
        }}
      >
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-body-soft pointer-events-none">⌕</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher un item…"
            className="font-serif-body text-sm outline-none"
            style={{
              width: 280,
              padding: "8px 12px 8px 32px",
              background: "#0c0703",
              border: "1px solid rgba(160,98,42,0.4)",
              color: "#f4ead2",
            }}
          />
        </div>
        <Chip active={selectedCategory === "all"} onClick={() => setSelectedCategory("all")}>
          Tous
        </Chip>
        {categoryOptions.map((cat) => (
          <Chip
            key={cat}
            active={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
          >
            {categoryLabels[cat] ?? cat}
          </Chip>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {hasDirtyChanges && (
            <>
              <span className="text-xs italic text-on-body-soft">
                {dirtyCount} modification{dirtyCount > 1 ? "s" : ""} en attente
              </span>
              <button
                type="button"
                onClick={() => {
                  setDirty({});
                  setItems(initialItems);
                }}
                disabled={saving}
                className="font-serif text-[11px] font-semibold uppercase px-3 py-1.5 cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  background: "transparent",
                  color: "rgba(244,234,210,0.7)",
                  border: "1px solid rgba(160,98,42,0.5)",
                  letterSpacing: "0.16em",
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="font-serif text-[11px] font-extrabold uppercase text-on-body px-3.5 py-1.5 cursor-pointer transition-[filter] hover:brightness-110 disabled:opacity-50"
                style={{
                  background: "linear-gradient(180deg, #3d6e2a, #1a3010)",
                  border: "2px solid #1a3010",
                  letterSpacing: "0.2em",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 8px rgba(0,0,0,0.5)",
                }}
              >
                {saving ? "Sauvegarde…" : "✓ Sauvegarder"}
              </button>
            </>
          )}
        </div>
      </div>

      {showAddPanel && (
        <Folio className="mb-3">
          <AddPanel
            addMode={addMode}
            switchAddMode={switchAddMode}
            referenceCartes={referenceCartes}
            referenceError={referenceError}
            hasDirtyChanges={hasDirtyChanges}
            adding={adding}
            saving={saving}
            cartePickerSearch={cartePickerSearch}
            setCartePickerSearch={setCartePickerSearch}
            cartePickerFamille={cartePickerFamille}
            setCartePickerFamille={setCartePickerFamille}
            familleOptions={familleOptions}
            filteredCartes={filteredCartes}
            existingNameSet={existingNameSet}
            selectedCarte={selectedCarte}
            selectedCarteId={selectedCarteId}
            selectCarte={selectCarte}
            newItemName={newItemName}
            setNewItemName={setNewItemName}
            newItemCategory={newItemCategory}
            setNewItemCategory={setNewItemCategory}
            newQtyCoffre={newQtyCoffre}
            setNewQtyCoffre={setNewQtyCoffre}
            newQtyEnMains={newQtyEnMains}
            setNewQtyEnMains={setNewQtyEnMains}
            newQtyProduction={newQtyProduction}
            setNewQtyProduction={setNewQtyProduction}
            newItemNotes={newItemNotes}
            setNewItemNotes={setNewItemNotes}
            solarAmount={solarAmount}
            setSolarAmount={setSolarAmount}
            solarTarget={solarTarget}
            setSolarTarget={setSolarTarget}
            addInventoryItem={addInventoryItem}
            addReferenceCarte={addReferenceCarte}
            addSolarAmount={addSolarAmount}
            resetNewItemForm={resetNewItemForm}
            setShowAddPanel={setShowAddPanel}
          />
        </Folio>
      )}

      <Folio>
        {filteredItems.length === 0 ? (
          <div className="px-6 py-12 text-center font-serif-body italic text-parch-muted">
            <div className="text-3xl text-gold/40 mb-2">⌂</div>
            Aucun item ne correspond aux filtres.
          </div>
        ) : (
          grouped.map(([category, categoryItems], sectionIndex) => (
            <div key={category}>
              <SectionHead
                title={categoryLabels[category] ?? category}
                count={categoryItems.length}
                isFirst={sectionIndex === 0}
              />
              <InventorySectionTable
                items={categoryItems}
                dirty={dirty}
                deletingItem={deletingItem}
                saving={saving}
                adding={adding}
                onCellSave={updateItem}
                onDelete={deleteItem}
              />
            </div>
          ))
        )}
      </Folio>
    </>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-serif text-[11px] font-bold uppercase px-3 py-1.5 cursor-pointer transition-colors"
      style={{
        letterSpacing: "0.14em",
        border: active ? "1px solid #c8842a" : "1px solid rgba(160,98,42,0.3)",
        background: active
          ? "linear-gradient(180deg, #A0622A, #6e3e10)"
          : "transparent",
        color: active ? "#f4ead2" : "rgba(244,234,210,0.5)",
        boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.15)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function SectionHead({
  title,
  count,
  isFirst,
}: {
  title: string;
  count: number;
  isFirst: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3.5 px-5 py-3"
      style={{
        background:
          "linear-gradient(180deg, rgba(160,98,42,0.22), rgba(160,98,42,0.10))",
        borderTop: isFirst ? "none" : "2px solid #8B1A1A",
        borderBottom: "2px solid #8B1A1A",
      }}
    >
      <span
        className="font-serif text-sm font-extrabold uppercase text-parch-ink-soft"
        style={{ letterSpacing: "0.24em" }}
      >
        ❦ {title} ❦
      </span>
      <div
        className="flex-1 h-0.5"
        style={{
          background:
            "repeating-linear-gradient(90deg, #8B1A1A 0 6px, transparent 6px 10px)",
        }}
      />
      <span
        className="font-serif text-xs font-semibold text-parch-ink-soft"
        style={{ letterSpacing: "0.1em" }}
      >
        {count} item{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function InventorySectionTable({
  items,
  dirty,
  deletingItem,
  saving,
  adding,
  onCellSave,
  onDelete,
}: {
  items: InventoryItem[];
  dirty: DirtyChanges;
  deletingItem: string | null;
  saving: boolean;
  adding: boolean;
  onCellSave: (
    itemName: string,
    field: "qty_coffre" | "qty_en_mains" | "notes",
    newValue: number | string | null
  ) => void;
  onDelete: (itemName: string) => void;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          <Th>Item</Th>
          <Th align="right" highlight>
            ☐ Coffre
          </Th>
          <Th align="right">En mains</Th>
          <Th align="right">Production</Th>
          <Th align="right">Total</Th>
          <Th align="left">Notes</Th>
          <Th align="left">Prix marché</Th>
          <Th align="right">Actions</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => {
          const total = item.qty_coffre + item.qty_en_mains + item.qty_production;
          const itemDirty = dirty[item.item_name];
          const displayItemName = formatInventoryItemName(item.item_name);
          const marketHref = buildMarketSearchHref(
            item.market_price?.marketItemName ?? displayItemName
          );
          const hasMarket = !!item.market_price;
          return (
            <tr
              key={item.item_name}
              style={i % 2 === 1 ? { background: "rgba(160,98,42,0.05)" } : undefined}
            >
              <Td>
                <span className="font-serif font-semibold text-[15px]">{displayItemName}</span>
              </Td>
              <Td align="right" highlight>
                <EditableCell
                  value={item.qty_coffre}
                  isDirty={itemDirty?.qty_coffre !== undefined}
                  bold
                  onSave={(v) => onCellSave(item.item_name, "qty_coffre", v)}
                />
              </Td>
              <Td align="right">
                <EditableCell
                  value={item.qty_en_mains}
                  isDirty={itemDirty?.qty_en_mains !== undefined}
                  onSave={(v) => onCellSave(item.item_name, "qty_en_mains", v)}
                />
              </Td>
              <Td align="right">
                <span className="font-serif italic tabular-nums text-parch-muted">
                  {item.qty_production}
                </span>
              </Td>
              <Td align="right">
                <span
                  className="font-serif tabular-nums"
                  style={{ fontWeight: 800, fontSize: 16, color: "#1a1008" }}
                >
                  {total}
                </span>
              </Td>
              <Td align="left">
                <EditableNotesCell
                  value={item.notes}
                  isDirty={itemDirty?.notes !== undefined}
                  onSave={(v) => onCellSave(item.item_name, "notes", v)}
                />
              </Td>
              <Td align="left">
                {hasMarket ? (
                  <Link
                    href={marketHref}
                    className="font-serif text-xs underline underline-offset-2"
                    style={{ color: "#3d6e2a" }}
                    title={`${formatCheapestMarket(item)}`}
                  >
                    {formatMarketPrice(item)}
                  </Link>
                ) : (
                  <span className="font-serif-body text-xs italic text-parch-muted">—</span>
                )}
              </Td>
              <Td align="right">
                <button
                  type="button"
                  onClick={() => onDelete(item.item_name)}
                  disabled={saving || adding || deletingItem === item.item_name}
                  title="Supprimer cet item"
                  className="inline-flex items-center justify-center rounded-full cursor-pointer transition-[filter] hover:brightness-110 active:scale-95 disabled:opacity-50"
                  style={{
                    width: 30,
                    height: 30,
                    background: "radial-gradient(circle at 35% 35%, #8B1A1Add, #8B1A1A88)",
                    border: "2px solid #8B1A1A",
                    color: "#f4ead2",
                    fontFamily: "var(--font-serif)",
                    fontWeight: 700,
                    fontSize: 13,
                    boxShadow:
                      "inset -2px -2px 4px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.3)",
                  }}
                >
                  {deletingItem === item.item_name ? "…" : "✕"}
                </button>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Th({
  children,
  align = "left",
  highlight = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  highlight?: boolean;
}) {
  return (
    <th
      className="font-serif font-bold uppercase text-[10px] px-4 py-3"
      style={{
        letterSpacing: "0.18em",
        textAlign: align,
        borderBottom: "2px solid rgba(139,32,32,0.3)",
        background: highlight ? "rgba(160,98,42,0.18)" : "rgba(160,98,42,0.08)",
        color: highlight ? "#6e3e10" : "#7a5028",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  highlight = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  highlight?: boolean;
}) {
  return (
    <td
      className="px-4 py-2 text-parch-ink align-middle"
      style={{
        textAlign: align,
        borderBottom: "1px solid rgba(139,32,32,0.14)",
        background: highlight ? "rgba(160,98,42,0.06)" : undefined,
      }}
    >
      {children}
    </td>
  );
}

/* ---------- Add panel ---------- */

interface AddPanelProps {
  addMode: AddMode;
  switchAddMode: (m: AddMode) => void;
  referenceCartes: InventoryReferenceCarte[] | null;
  referenceError: string | null;
  hasDirtyChanges: boolean;
  adding: boolean;
  saving: boolean;
  cartePickerSearch: string;
  setCartePickerSearch: (s: string) => void;
  cartePickerFamille: string;
  setCartePickerFamille: (s: string) => void;
  familleOptions: string[];
  filteredCartes: InventoryReferenceCarte[];
  existingNameSet: Set<string>;
  selectedCarte: InventoryReferenceCarte | null;
  selectedCarteId: string | null;
  selectCarte: (c: InventoryReferenceCarte) => void;
  newItemName: string;
  setNewItemName: (s: string) => void;
  newItemCategory: string;
  setNewItemCategory: (s: string) => void;
  newQtyCoffre: string;
  setNewQtyCoffre: (s: string) => void;
  newQtyEnMains: string;
  setNewQtyEnMains: (s: string) => void;
  newQtyProduction: string;
  setNewQtyProduction: (s: string) => void;
  newItemNotes: string;
  setNewItemNotes: (s: string) => void;
  solarAmount: string;
  setSolarAmount: (s: string) => void;
  solarTarget: "qty_coffre" | "qty_en_mains";
  setSolarTarget: (s: "qty_coffre" | "qty_en_mains") => void;
  addInventoryItem: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
  addReferenceCarte: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
  addSolarAmount: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
  resetNewItemForm: () => void;
  setShowAddPanel: (b: boolean) => void;
}

function AddPanel(props: AddPanelProps) {
  const {
    addMode,
    switchAddMode,
    referenceCartes,
    referenceError,
    hasDirtyChanges,
    adding,
    saving,
  } = props;

  return (
    <div className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2
          className="font-serif text-base font-extrabold uppercase text-parch-ink-soft"
          style={{ letterSpacing: "0.22em" }}
        >
          ❦ Ajouter à l&apos;inventaire ❦
        </h2>
        <div
          className="inline-flex"
          style={{ border: "1px solid #4a2810", background: "rgba(160,98,42,0.08)" }}
        >
          <ModeTab active={addMode === "reference"} onClick={() => switchAddMode("reference")}>
            Du référentiel
          </ModeTab>
          <ModeTab active={addMode === "custom"} onClick={() => switchAddMode("custom")}>
            Personnalisée
          </ModeTab>
          <ModeTab active={addMode === "solar"} onClick={() => switchAddMode("solar")}>
            Solar
          </ModeTab>
        </div>
      </div>

      {hasDirtyChanges && (
        <div
          className="mb-3 px-3 py-2 text-sm font-serif-body italic"
          style={{
            background: "rgba(200,132,42,0.15)",
            border: "1px solid #c8842a",
            color: "#4a2810",
          }}
        >
          Sauvegardez ou annulez les modifications en cours avant d&apos;ajouter une ligne.
        </div>
      )}

      {addMode === "reference" && (
        <ReferenceMode {...props} referenceCartes={referenceCartes} referenceError={referenceError} />
      )}
      {addMode === "custom" && <CustomMode {...props} />}
      {addMode === "solar" && <SolarMode {...props} />}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            props.resetNewItemForm();
            props.setShowAddPanel(false);
          }}
          disabled={adding || saving}
          className="font-serif text-[11px] font-semibold uppercase px-4 py-2 cursor-pointer"
          style={{
            background: "transparent",
            color: "#4a2810",
            border: "1px solid #4a2810",
            letterSpacing: "0.16em",
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-serif text-[11px] font-bold uppercase px-3 py-1.5 cursor-pointer transition-colors"
      style={{
        letterSpacing: "0.14em",
        background: active ? "linear-gradient(180deg, #A0622A, #6e3e10)" : "transparent",
        color: active ? "#f4ead2" : "#7a5028",
        boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.15)" : "none",
      }}
    >
      {children}
    </button>
  );
}

const FORM_INPUT_CLASS =
  "px-3 py-2 text-sm font-serif-body outline-none focus:ring-1 focus:ring-gold-light";
const FORM_INPUT_STYLE: React.CSSProperties = {
  background: "var(--color-input)",
  border: "1px solid #4a2810",
  color: "#1a1008",
};
const FORM_LABEL_CLASS =
  "flex flex-col gap-1 font-serif text-[10px] font-bold uppercase tracking-[0.18em] text-parch-muted";

function CustomMode({
  adding,
  saving,
  hasDirtyChanges,
  newItemName,
  setNewItemName,
  newItemCategory,
  setNewItemCategory,
  newQtyCoffre,
  setNewQtyCoffre,
  newQtyEnMains,
  setNewQtyEnMains,
  newQtyProduction,
  setNewQtyProduction,
  newItemNotes,
  setNewItemNotes,
  addInventoryItem,
}: AddPanelProps) {
  return (
    <form onSubmit={addInventoryItem} className="grid gap-3 md:grid-cols-6">
      <label className={`${FORM_LABEL_CLASS} md:col-span-2`}>
        Nom
        <input
          type="text"
          required
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          className={FORM_INPUT_CLASS}
          style={FORM_INPUT_STYLE}
        />
      </label>
      <label className={FORM_LABEL_CLASS}>
        Section
        <select
          value={newItemCategory}
          onChange={(e) => setNewItemCategory(e.target.value)}
          className={FORM_INPUT_CLASS}
          style={FORM_INPUT_STYLE}
        >
          {Object.entries(categoryLabels).map(([c, l]) => (
            <option key={c} value={c}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className={FORM_LABEL_CLASS}>
        Coffre
        <input
          type="number"
          min="0"
          step="1"
          value={newQtyCoffre}
          onChange={(e) => setNewQtyCoffre(e.target.value)}
          className={FORM_INPUT_CLASS}
          style={FORM_INPUT_STYLE}
        />
      </label>
      <label className={FORM_LABEL_CLASS}>
        En mains
        <input
          type="number"
          min="0"
          step="1"
          value={newQtyEnMains}
          onChange={(e) => setNewQtyEnMains(e.target.value)}
          className={FORM_INPUT_CLASS}
          style={FORM_INPUT_STYLE}
        />
      </label>
      <label className={FORM_LABEL_CLASS}>
        Production
        <input
          type="number"
          min="0"
          step="1"
          value={newQtyProduction}
          onChange={(e) => setNewQtyProduction(e.target.value)}
          className={FORM_INPUT_CLASS}
          style={FORM_INPUT_STYLE}
        />
      </label>
      <label className={`${FORM_LABEL_CLASS} md:col-span-4`}>
        Note
        <input
          type="text"
          value={newItemNotes}
          onChange={(e) => setNewItemNotes(e.target.value)}
          className={FORM_INPUT_CLASS}
          style={FORM_INPUT_STYLE}
        />
      </label>
      <div className="md:col-span-2 flex items-end justify-end">
        <PrimaryButton
          type="submit"
          disabled={adding || saving || hasDirtyChanges}
          style={{ opacity: adding || saving || hasDirtyChanges ? 0.5 : 1 }}
        >
          {adding ? "† Ajout…" : "† Ajouter"}
        </PrimaryButton>
      </div>
    </form>
  );
}

function SolarMode({
  adding,
  saving,
  hasDirtyChanges,
  solarAmount,
  setSolarAmount,
  solarTarget,
  setSolarTarget,
  addSolarAmount,
}: AddPanelProps) {
  return (
    <form onSubmit={addSolarAmount} className="grid gap-3 sm:grid-cols-3">
      <label className={FORM_LABEL_CLASS}>
        Montant
        <input
          type="number"
          min="1"
          step="1"
          required
          value={solarAmount}
          onChange={(e) => setSolarAmount(e.target.value)}
          className={FORM_INPUT_CLASS}
          style={FORM_INPUT_STYLE}
        />
      </label>
      <label className={FORM_LABEL_CLASS}>
        Ajouter à
        <select
          value={solarTarget}
          onChange={(e) => setSolarTarget(e.target.value as "qty_coffre" | "qty_en_mains")}
          className={FORM_INPUT_CLASS}
          style={FORM_INPUT_STYLE}
        >
          <option value="qty_coffre">Coffre</option>
          <option value="qty_en_mains">En mains</option>
        </select>
      </label>
      <div className="flex items-end justify-end">
        <PrimaryButton
          type="submit"
          disabled={adding || saving || hasDirtyChanges}
          style={{ opacity: adding || saving || hasDirtyChanges ? 0.5 : 1 }}
        >
          {adding ? "† Ajout…" : "† Ajouter du Solar"}
        </PrimaryButton>
      </div>
    </form>
  );
}

function ReferenceMode(props: AddPanelProps) {
  const {
    referenceCartes,
    referenceError,
    switchAddMode,
    cartePickerSearch,
    setCartePickerSearch,
    cartePickerFamille,
    setCartePickerFamille,
    familleOptions,
    filteredCartes,
    existingNameSet,
    selectedCarte,
    selectedCarteId,
    selectCarte,
    newItemCategory,
    setNewItemCategory,
    newQtyCoffre,
    setNewQtyCoffre,
    newQtyEnMains,
    setNewQtyEnMains,
    newQtyProduction,
    setNewQtyProduction,
    newItemNotes,
    setNewItemNotes,
    addReferenceCarte,
    adding,
    saving,
    hasDirtyChanges,
  } = props;

  if (!referenceCartes) {
    return (
      <div
        className="px-4 py-3 text-sm font-serif-body italic"
        style={{
          background: "rgba(200,132,42,0.12)",
          border: "1px solid #c8842a",
          color: "#4a2810",
        }}
      >
        {referenceError ?? "Le référentiel n'est pas disponible pour le moment."}
        <button
          type="button"
          onClick={() => switchAddMode("custom")}
          className="ml-2 underline underline-offset-2"
        >
          Passer en mode personnalisé
        </button>
      </div>
    );
  }
  if (referenceCartes.length === 0) {
    return (
      <div
        className="px-4 py-3 text-sm font-serif-body italic"
        style={{ background: "rgba(160,98,42,0.08)", border: "1px solid #4a2810", color: "#4a2810" }}
      >
        Aucune carte n&apos;est disponible dans le référentiel.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={FORM_LABEL_CLASS}>
          Recherche
          <input
            type="search"
            value={cartePickerSearch}
            onChange={(e) => setCartePickerSearch(e.target.value)}
            placeholder="Rechercher une carte…"
            className={FORM_INPUT_CLASS}
            style={FORM_INPUT_STYLE}
          />
        </label>
        <label className={FORM_LABEL_CLASS}>
          Famille
          <select
            value={cartePickerFamille}
            onChange={(e) => setCartePickerFamille(e.target.value)}
            className={FORM_INPUT_CLASS}
            style={FORM_INPUT_STYLE}
          >
            <option value="all">Toutes les familles</option>
            {familleOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="max-h-72 overflow-y-auto"
        style={{ border: "1px solid #4a2810", background: "rgba(244,234,210,0.4)" }}
      >
        <p
          className="px-3 py-2 font-serif text-[10px] font-bold uppercase border-b"
          style={{ borderColor: "#4a2810", letterSpacing: "0.18em", color: "#7a5028" }}
        >
          {filteredCartes.length} carte{filteredCartes.length > 1 ? "s" : ""}
        </p>
        {filteredCartes.length === 0 ? (
          <p className="px-3 py-4 text-sm font-serif-body italic text-parch-muted">
            Aucune carte ne correspond.
          </p>
        ) : (
          <ul>
            {filteredCartes.map((carte) => {
              const isSelected = carte.id === selectedCarteId;
              const isAlreadyAdded = existingNameSet.has(
                carte.nameFr.toLocaleLowerCase("fr-CA")
              );
              return (
                <li key={carte.id} style={{ borderTop: "1px solid rgba(139,32,32,0.12)" }}>
                  <button
                    type="button"
                    disabled={isAlreadyAdded}
                    onClick={() => selectCarte(carte)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors disabled:opacity-50"
                    style={{
                      background: isSelected ? "rgba(200,132,42,0.18)" : "transparent",
                      color: "#1a1008",
                      cursor: isAlreadyAdded ? "not-allowed" : "pointer",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-serif font-semibold">{carte.nameFr}</span>
                      <span className="ml-2 text-xs italic text-parch-muted">
                        {carte.famille}
                        {carte.sphere ? ` · ${carte.sphere}` : ""}
                      </span>
                    </div>
                    {isAlreadyAdded ? (
                      <span className="font-serif text-[9px] font-extrabold uppercase tracking-[0.16em] text-parch-muted">
                        Déjà au coffre
                      </span>
                    ) : isSelected ? (
                      <span
                        className="font-serif text-[9px] font-extrabold uppercase tracking-[0.16em]"
                        style={{ color: "#c8842a" }}
                      >
                        Sélectionnée
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedCarte && (
        <form
          onSubmit={addReferenceCarte}
          className="grid gap-3 p-3 md:grid-cols-6"
          style={{ background: "rgba(160,98,42,0.08)", border: "1px dashed #4a2810" }}
        >
          <div className="md:col-span-2">
            <div
              className="font-serif text-[10px] font-bold uppercase mb-1 text-parch-muted"
              style={{ letterSpacing: "0.18em" }}
            >
              Nom
            </div>
            <div className="font-serif font-semibold text-parch-ink">{selectedCarte.nameFr}</div>
          </div>
          <label className={FORM_LABEL_CLASS}>
            Section
            <select
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
              className={FORM_INPUT_CLASS}
              style={FORM_INPUT_STYLE}
            >
              {Object.entries(categoryLabels).map(([c, l]) => (
                <option key={c} value={c}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className={FORM_LABEL_CLASS}>
            Coffre
            <input
              type="number"
              min="0"
              step="1"
              value={newQtyCoffre}
              onChange={(e) => setNewQtyCoffre(e.target.value)}
              className={FORM_INPUT_CLASS}
              style={FORM_INPUT_STYLE}
            />
          </label>
          <label className={FORM_LABEL_CLASS}>
            En mains
            <input
              type="number"
              min="0"
              step="1"
              value={newQtyEnMains}
              onChange={(e) => setNewQtyEnMains(e.target.value)}
              className={FORM_INPUT_CLASS}
              style={FORM_INPUT_STYLE}
            />
          </label>
          <label className={FORM_LABEL_CLASS}>
            Production
            <input
              type="number"
              min="0"
              step="1"
              value={newQtyProduction}
              onChange={(e) => setNewQtyProduction(e.target.value)}
              className={FORM_INPUT_CLASS}
              style={FORM_INPUT_STYLE}
            />
          </label>
          <label className={`${FORM_LABEL_CLASS} md:col-span-4`}>
            Note
            <input
              type="text"
              value={newItemNotes}
              onChange={(e) => setNewItemNotes(e.target.value)}
              className={FORM_INPUT_CLASS}
              style={FORM_INPUT_STYLE}
            />
          </label>
          <div className="md:col-span-2 flex items-end justify-end">
            <PrimaryButton
              type="submit"
              disabled={adding || saving || hasDirtyChanges}
              style={{ opacity: adding || saving || hasDirtyChanges ? 0.5 : 1 }}
            >
              {adding ? "† Ajout…" : "† Ajouter"}
            </PrimaryButton>
          </div>
        </form>
      )}
    </div>
  );
}
