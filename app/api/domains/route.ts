import { NextResponse } from "next/server";
import { getDb } from "@/db";

export async function GET() {
  const db = getDb();

  const domains = db.prepare(`
    SELECT d.*, st.name as stage_name, st.max_buildings as stage_max_buildings,
           p.name as province_name, f.name as fief_name
    FROM domains d
    JOIN stage_templates st ON st.id = d.stage_id
    JOIN provinces p ON p.id = d.province_id
    LEFT JOIN fiefs f ON f.id = d.fief_id
    WHERE d.guild_id = 'mek_dyude'
    ORDER BY d.name
  `).all() as Array<Record<string, unknown>>;

  const buildings = db.prepare(`
    SELECT db.*, bt.name as building_name, bt.capacity, bt.assignment_type,
           bt.resource_produced, bt.ratio_per_unit, bt.sphere
    FROM domain_buildings db
    JOIN building_templates bt ON bt.id = db.building_template_id
    JOIN domains d ON d.id = db.domain_id
    WHERE d.guild_id = 'mek_dyude'
    ORDER BY bt.name
  `).all() as Array<Record<string, unknown>>;

  const buildingsByDomain: Record<string, Array<Record<string, unknown>>> = {};
  for (const b of buildings) {
    const domainId = b.domain_id as string;
    if (!buildingsByDomain[domainId]) buildingsByDomain[domainId] = [];
    buildingsByDomain[domainId].push(b);
  }

  const result = domains.map((d) => ({
    ...d,
    buildings: buildingsByDomain[d.id as string] || [],
  }));

  return NextResponse.json(result);
}
