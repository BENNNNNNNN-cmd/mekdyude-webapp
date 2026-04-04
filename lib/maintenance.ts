import { getDb } from "@/db";

export interface MaintenanceLine {
  resource: string;
  required: number;
  produced: number;
  status: "ok" | "warning";
}

export function computeMaintenance(): MaintenanceLine[] {
  const db = getDb();

  // Get total maintenance across all Mek Dyude domains
  const maintenanceRows = db.prepare(`
    SELECT mt.resource_type, SUM(mt.annual_cost) as total_cost
    FROM domains d
    JOIN maintenance_templates mt ON mt.stage_id = d.stage_id
    WHERE d.guild_id = 'mek_dyude'
    GROUP BY mt.resource_type
  `).all() as Array<{ resource_type: string; total_cost: number }>;

  // Get production from inventory
  const inventoryRows = db.prepare(`
    SELECT item_name, qty_production
    FROM inventory
    WHERE guild_id = 'mek_dyude'
  `).all() as Array<{ item_name: string; qty_production: number }>;

  const productionMap: Record<string, number> = {};
  for (const row of inventoryRows) {
    productionMap[row.item_name.toLowerCase()] = row.qty_production;
  }

  // Map maintenance resource types to inventory item names
  const resourceDisplayMap: Record<string, string> = {
    cereales: "Céréales",
    betails: "Bétail",
    ressources: "Ressources",
    equipements: "Équipements",
    macons: "Maçon",
    intendants: "Intendant",
    charpentiers: "Charpentier",
    forgerons: "Forgeron",
    ingenieurs: "Ingénieur",
  };

  return maintenanceRows.map((row) => {
    const displayName = resourceDisplayMap[row.resource_type] || row.resource_type;
    const produced = productionMap[displayName.toLowerCase()] ?? 0;
    return {
      resource: displayName,
      required: row.total_cost,
      produced,
      status: produced >= row.total_cost ? "ok" : "warning",
    };
  });
}
