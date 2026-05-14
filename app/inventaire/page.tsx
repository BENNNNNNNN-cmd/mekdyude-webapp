import { connection } from "next/server";
import { getDb } from "@/db";
import { getMarketPriceSummaries, type MarketPriceSummary } from "@/lib/market-prices";
import { getCartes, ReferenceDataError } from "@/lib/reference-postgres";
import InventoryTable from "./InventoryTable";

// Reads directly from SQLite — Next.js can't track invalidation, so force
// per-request rendering. Without this, the page is prerendered at build time
// and the first cold visit serves stale data until Cmd+Shift+R.
export const dynamic = "force-dynamic";

export interface InventoryItem {
  id: number;
  item_name: string;
  category: string;
  qty_coffre: number;
  qty_en_mains: number;
  qty_production: number;
  notes: string | null;
  market_price?: MarketPriceSummary | null;
}

export interface InventoryReferenceCarte {
  id: string;
  nameFr: string;
  famille: string;
  sousFamille: string | null;
  sphere: string | null;
}

function normalizeInventoryItemName(itemName: string) {
  return itemName.toLocaleLowerCase("fr-CA") === "solaris" ? "Solar" : itemName;
}

export default async function InventairePage() {
  await connection();

  const db = getDb();
  const inventoryItems = db.prepare(`
    SELECT * FROM inventory WHERE guild_id = 'mek_dyude' ORDER BY category, item_name
  `).all() as Array<Omit<InventoryItem, "market_price">>;
  const normalizedInventoryItems = inventoryItems.map((item) => ({
    ...item,
    item_name: normalizeInventoryItemName(item.item_name),
  }));
  const marketPrices = await getMarketPriceSummaries(
    normalizedInventoryItems.map((item) => item.item_name)
  );
  const items = normalizedInventoryItems.map((item) => ({
    ...item,
    market_price: marketPrices.get(item.item_name) ?? null,
  }));

  let referenceCartes: InventoryReferenceCarte[] | null = null;
  let referenceError: string | null = null;
  try {
    const cartes = await getCartes();
    referenceCartes = cartes
      .filter((c) => c.statut === "Confirmé")
      .map((c) => ({
        id: c.id,
        nameFr: c.nameFr,
        famille: c.famille,
        sousFamille: c.sousFamille,
        sphere: c.sphere,
      }));
  } catch (err) {
    if (err instanceof ReferenceDataError) {
      referenceError = "Le référentiel n'est pas disponible pour le moment.";
    } else {
      throw err;
    }
  }

  const existingItemNamesNormalized = normalizedInventoryItems.map((item) =>
    item.item_name.toLocaleLowerCase("fr-CA")
  );

  return (
    <div className="max-w-[1400px] mx-auto">
      <InventoryTable
        initialItems={items}
        referenceCartes={referenceCartes}
        existingItemNamesNormalized={existingItemNamesNormalized}
        referenceError={referenceError}
      />
    </div>
  );
}
