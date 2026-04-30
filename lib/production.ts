import { getDb } from "@/db";
import { loadRepo } from "@/lib/production-tree/engine";

export interface ProductionLine {
  domainId: string;
  domainName: string;
  buildingId: string;
  buildingName: string;
  assignedCount: number;
  capacity: number;
  assignmentType: string;
  resource: string;
  amount: number;
  staffingStatus: "full" | "partial" | "unstaffed" | "none";
}

/**
 * Multi-output buildings (Abbaye, etc.) emit multiple resource lines from a
 * single staffed-worker pool. Carries the same domain/staff metadata as
 * ProductionLine, plus a list of resource amounts.
 */
export interface MultiOutputProduction {
  domainId: string;
  domainName: string;
  buildingId: string;
  buildingName: string;
  assignedCount: number;
  capacity: number;
  assignmentType: string;
  lines: { resource: string; amount: number }[];
  staffingStatus: "full" | "partial" | "unstaffed";
}

export type ProductionEntry = ProductionLine | MultiOutputProduction;

export function isMultiOutputProduction(entry: ProductionEntry): entry is MultiOutputProduction {
  return "lines" in entry;
}

/** @deprecated Use isMultiOutputProduction. Kept for back-compat with callers. */
export const isAbbayeProduction = isMultiOutputProduction;

function getStaffingStatus(
  assigned: number,
  capacity: number
): "full" | "partial" | "unstaffed" | "none" {
  if (capacity <= 0) return "none";
  if (assigned >= capacity) return "full";
  if (assigned > 0) return "partial";
  return "unstaffed";
}

export async function computeProduction(guildId = "mek_dyude"): Promise<ProductionEntry[]> {
  const db = getDb();
  const repo = await loadRepo();

  const rows = db
    .prepare(
      `SELECT db.id AS db_id, db.domain_id, db.building_template_id, db.assigned_count,
              d.name AS domain_name
       FROM domain_buildings db
       JOIN domains d ON d.id = db.domain_id
       WHERE d.guild_id = ?
       ORDER BY d.name, db.building_template_id`
    )
    .all(guildId) as Array<{
    db_id: string;
    domain_id: string;
    building_template_id: string;
    assigned_count: number;
    domain_name: string;
  }>;

  const results: ProductionEntry[] = [];

  for (const row of rows) {
    const building = repo.getBuilding(row.building_template_id);
    if (!building) continue;
    const assigned = row.assigned_count ?? 0;
    const capacity = building.inputs[0]?.max_quantity ?? 0;
    const assignmentType = building.inputs[0]?.card_title ?? "";

    if (building.outputs.length === 0) continue;

    if (building.outputs.length > 1) {
      const lines = building.outputs.map((o) => ({
        resource: o.card_title,
        amount: computeOutputAmount(assigned, capacity, o),
      }));
      results.push({
        domainId: row.domain_id,
        domainName: row.domain_name,
        buildingId: row.building_template_id,
        buildingName: building.name,
        assignedCount: assigned,
        capacity,
        assignmentType,
        lines,
        staffingStatus: getStaffingStatus(assigned, capacity) as "full" | "partial" | "unstaffed",
      });
    } else {
      const o = building.outputs[0];
      results.push({
        domainId: row.domain_id,
        domainName: row.domain_name,
        buildingId: row.building_template_id,
        buildingName: building.name,
        assignedCount: assigned,
        capacity,
        assignmentType,
        resource: o.card_title,
        amount: computeOutputAmount(assigned, capacity, o),
        staffingStatus: getStaffingStatus(assigned, capacity),
      });
    }
  }

  return results;
}

function computeOutputAmount(
  assigned: number,
  capacity: number,
  output: { quantity_per_input: number; input_divisor: number; full_capacity_bonus: number }
): number {
  const per = output.quantity_per_input / Math.max(1, output.input_divisor);
  const base = assigned * per;
  const bonus = capacity > 0 && assigned >= capacity ? output.full_capacity_bonus : 0;
  return base + bonus;
}

export async function getProductionSummary(guildId = "mek_dyude") {
  const production = await computeProduction(guildId);
  const totals: Record<string, number> = {};

  for (const entry of production) {
    if (isMultiOutputProduction(entry)) {
      for (const line of entry.lines) {
        totals[line.resource] = (totals[line.resource] || 0) + line.amount;
      }
    } else {
      if (entry.amount > 0 && entry.resource) {
        totals[entry.resource] = (totals[entry.resource] || 0) + entry.amount;
      }
    }
  }

  return { production, totals };
}
