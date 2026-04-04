import { getDb } from "@/db";
import ReglesClient from "./ReglesClient";

export interface BuildingTemplate {
  id: string;
  name: string;
  sphere: string;
  capacity: number;
  assignment_type: string;
  resource_produced: string;
  ratio_per_unit: number;
  domain_limitation: string | null;
  prerequisite_building: string | null;
  structure_points: number;
  notes: string | null;
  construction_costs: Record<string, number>;
}

export default function ReglesPage() {
  const db = getDb();

  const rows = db.prepare(`
    SELECT bt.*, GROUP_CONCAT(cc.resource_type || ':' || cc.amount, '|') as costs_raw
    FROM building_templates bt
    LEFT JOIN construction_costs cc ON cc.building_id = bt.id
    GROUP BY bt.id
    ORDER BY bt.sphere, bt.name
  `).all() as Array<Record<string, unknown>>;

  const buildings: BuildingTemplate[] = rows.map((row) => {
    const costsRaw = row.costs_raw as string | null;
    const costs: Record<string, number> = {};
    if (costsRaw) {
      for (const pair of costsRaw.split("|")) {
        const [resource, amount] = pair.split(":");
        costs[resource] = parseInt(amount);
      }
    }
    return {
      id: row.id as string,
      name: row.name as string,
      sphere: row.sphere as string,
      capacity: row.capacity as number,
      assignment_type: row.assignment_type as string,
      resource_produced: row.resource_produced as string,
      ratio_per_unit: row.ratio_per_unit as number,
      domain_limitation: row.domain_limitation as string | null,
      prerequisite_building: row.prerequisite_building as string | null,
      structure_points: row.structure_points as number,
      notes: row.notes as string | null,
      construction_costs: costs,
    };
  });

  // Get all spheres for filter
  const spheres = [...new Set(buildings.map((b) => b.sphere))].sort();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="font-serif text-3xl font-bold text-foreground">Règles — Bâtiments</h1>
      <p className="text-sm text-foreground/60">
        Référence des 53 bâtiments du Tableau 6. Cliquez sur une ligne pour voir les coûts de construction.
      </p>
      <ReglesClient buildings={buildings} spheres={spheres} />
    </div>
  );
}
