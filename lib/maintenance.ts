import { getDb } from "@/db";
import { getCoutsForStade, normalizeName } from "@/lib/reference-postgres";

export interface MaintenanceLine {
  resource: string;
  required: number;
  produced: number;
  status: "ok" | "warning";
}

export async function computeMaintenance(guildId = "mek_dyude"): Promise<MaintenanceLine[]> {
  const db = getDb();

  const stages = db
    .prepare("SELECT stage_id, COUNT(*) AS n FROM domains WHERE guild_id = ? GROUP BY stage_id")
    .all(guildId) as Array<{ stage_id: string; n: number }>;

  const totals = new Map<string, number>();
  for (const { stage_id, n } of stages) {
    const couts = await getCoutsForStade(stage_id, "Entretien");
    for (const c of couts) {
      if (!c.composant || c.quantite === null) continue;
      totals.set(c.composant, (totals.get(c.composant) ?? 0) + c.quantite * n);
    }
  }

  const inventoryRows = db
    .prepare("SELECT item_name, qty_production FROM inventory WHERE guild_id = ?")
    .all(guildId) as Array<{ item_name: string; qty_production: number }>;
  const productionMap = new Map<string, number>();
  for (const row of inventoryRows) {
    productionMap.set(normalizeName(row.item_name), row.qty_production);
  }

  return [...totals.entries()]
    .map(([resource, required]) => {
      const produced = productionMap.get(normalizeName(resource)) ?? 0;
      return {
        resource,
        required,
        produced,
        status: produced >= required ? "ok" : "warning",
      } as MaintenanceLine;
    })
    .sort((a, b) => a.resource.localeCompare(b.resource, "fr"));
}
