import { NextResponse } from "next/server";
import { getDb, ensureReferenceMigration } from "@/db";
import { getBatiments, getStades } from "@/lib/reference-postgres";

export async function GET() {
  await ensureReferenceMigration();
  const db = getDb();

  const [batiments, stades] = await Promise.all([getBatiments(), getStades()]);
  const batimentById = new Map(batiments.map((b) => [b.id, b]));
  const stadeById = new Map(stades.map((s) => [s.id, s]));

  const domains = db
    .prepare(
      `SELECT d.*, p.name AS province_name, f.name AS fief_name
       FROM domains d
       JOIN provinces p ON p.id = d.province_id
       LEFT JOIN fiefs f ON f.id = d.fief_id
       WHERE d.guild_id = 'mek_dyude'
       ORDER BY d.name`
    )
    .all() as Array<Record<string, unknown> & { id: string; stage_id: string }>;

  const dbBuildings = db
    .prepare(
      `SELECT db.*, d.guild_id
       FROM domain_buildings db
       JOIN domains d ON d.id = db.domain_id
       WHERE d.guild_id = 'mek_dyude'`
    )
    .all() as Array<{ domain_id: string; building_template_id: string; assigned_count: number }>;

  const buildingsByDomain: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of dbBuildings) {
    const batiment = batimentById.get(row.building_template_id);
    if (!batiment) continue;
    const enriched = {
      domain_id: row.domain_id,
      building_template_id: row.building_template_id,
      assigned_count: row.assigned_count,
      building_name: batiment.nameFr,
      capacity: batiment.capaciteQuantite ?? 0,
      assignment_type: batiment.capaciteType ?? "",
      sphere: batiment.sphere ?? "Autre",
      statut: batiment.statut,
    };
    (buildingsByDomain[row.domain_id] ??= []).push(enriched);
  }

  const result = domains.map((d) => {
    const stade = stadeById.get(d.stage_id);
    return {
      ...d,
      stage_name: stade?.nameFr ?? d.stage_id,
      stage_max_buildings: stade?.nombreMaxBatiments ?? null,
      buildings: buildingsByDomain[d.id] ?? [],
    };
  });

  return NextResponse.json(result);
}
