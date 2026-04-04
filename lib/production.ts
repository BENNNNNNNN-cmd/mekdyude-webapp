import { getDb } from "@/db";

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

export interface AbbayeProduction {
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

export type ProductionEntry = ProductionLine | AbbayeProduction;

export function isAbbayeProduction(entry: ProductionEntry): entry is AbbayeProduction {
  return "lines" in entry;
}

function getStaffingStatus(assigned: number, capacity: number): "full" | "partial" | "unstaffed" | "none" {
  if (capacity <= 0) return "none";
  if (assigned >= capacity) return "full";
  if (assigned > 0) return "partial";
  return "unstaffed";
}

export function computeProduction(): ProductionEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      db.id as db_id, db.domain_id, db.building_template_id, db.assigned_count,
      d.name as domain_name,
      bt.name as building_name, bt.capacity, bt.assignment_type,
      bt.resource_produced, bt.ratio_per_unit
    FROM domain_buildings db
    JOIN domains d ON d.id = db.domain_id
    JOIN building_templates bt ON bt.id = db.building_template_id
    WHERE d.guild_id = 'mek_dyude'
    ORDER BY d.name, bt.name
  `).all() as Array<{
    db_id: string; domain_id: string; building_template_id: string; assigned_count: number;
    domain_name: string; building_name: string; capacity: number; assignment_type: string;
    resource_produced: string; ratio_per_unit: number;
  }>;

  const results: ProductionEntry[] = [];

  for (const row of rows) {
    const capacity = row.capacity ?? 0;
    const assigned = row.assigned_count ?? 0;

    if (row.building_name === "Abbaye") {
      results.push({
        domainId: row.domain_id,
        domainName: row.domain_name,
        buildingId: row.building_template_id,
        buildingName: row.building_name,
        assignedCount: assigned,
        capacity,
        assignmentType: row.assignment_type,
        lines: [
          { resource: "Victuailles", amount: assigned * 7 },
          { resource: "Équipements", amount: assigned * 7 },
          { resource: "Armements", amount: assigned * 3 },
        ],
        staffingStatus: getStaffingStatus(assigned, capacity) as "full" | "partial" | "unstaffed",
      });
    } else {
      const amount = assigned * (row.ratio_per_unit ?? 0);
      results.push({
        domainId: row.domain_id,
        domainName: row.domain_name,
        buildingId: row.building_template_id,
        buildingName: row.building_name,
        assignedCount: assigned,
        capacity,
        assignmentType: row.assignment_type,
        resource: row.resource_produced || "",
        amount,
        staffingStatus: getStaffingStatus(assigned, capacity),
      });
    }
  }

  return results;
}

export function getProductionSummary() {
  const production = computeProduction();
  const totals: Record<string, number> = {};

  for (const entry of production) {
    if (isAbbayeProduction(entry)) {
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
