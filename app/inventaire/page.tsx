import { getDb } from "@/db";
import InventoryTable from "./InventoryTable";

export interface InventoryItem {
  id: number;
  item_name: string;
  category: string;
  qty_coffre: number;
  qty_en_mains: number;
  qty_production: number;
  notes: string | null;
}

export default function InventairePage() {
  const db = getDb();
  const items = db.prepare(`
    SELECT * FROM inventory WHERE guild_id = 'mek_dyude' ORDER BY category, item_name
  `).all() as InventoryItem[];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="font-serif text-3xl font-bold text-foreground">Inventaire</h1>
      <p className="text-sm text-foreground/60">
        Cliquez sur les cellules Coffre ou En mains pour modifier les valeurs. Les changements sont sauvegardés automatiquement.
      </p>
      <InventoryTable initialItems={items} />
    </div>
  );
}
