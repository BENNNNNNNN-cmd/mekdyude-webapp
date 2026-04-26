import { connection } from "next/server";
import { getDb } from "@/db";
import { getMarketPriceSummaries, type MarketPriceSummary } from "@/lib/market-prices";
import InventoryTable from "./InventoryTable";

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

export default async function InventairePage() {
  await connection();

  const db = getDb();
  const inventoryItems = db.prepare(`
    SELECT * FROM inventory WHERE guild_id = 'mek_dyude' ORDER BY category, item_name
  `).all() as InventoryItem[];
  const marketPrices = await getMarketPriceSummaries(
    inventoryItems.map((item) => item.item_name)
  );
  const items = inventoryItems.map((item) => ({
    ...item,
    market_price: marketPrices.get(item.item_name) ?? null,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="font-serif text-3xl font-bold text-foreground">Inventaire</h1>
      <p className="text-sm text-foreground/60">
        Cliquez sur les cellules Coffre ou En mains pour modifier les valeurs, puis appuyez sur Sauvegarder.
      </p>
      <InventoryTable initialItems={items} />
    </div>
  );
}
