import { NextRequest, NextResponse } from "next/server";
import { ensureReferenceMigration } from "@/db";
import { getBatiments, getCouts } from "@/lib/reference-postgres";

export async function GET(request: NextRequest) {
  await ensureReferenceMigration();
  const { searchParams } = new URL(request.url);
  const sphere = searchParams.get("sphere");

  const [batiments, couts] = await Promise.all([getBatiments(), getCouts()]);

  const constructionCostsByBatiment = new Map<string, Record<string, number>>();
  for (const c of couts) {
    if (c.objetType !== "Bâtiment" || c.typeCout !== "Construction") continue;
    if (!c.composant || c.quantite === null) continue;
    const map = constructionCostsByBatiment.get(c.objetId) ?? {};
    map[c.composant] = (map[c.composant] ?? 0) + c.quantite;
    constructionCostsByBatiment.set(c.objetId, map);
  }

  let filtered = batiments;
  if (sphere) filtered = batiments.filter((b) => b.sphere === sphere);

  const result = filtered
    .map((b) => ({
      id: b.id,
      name: b.nameFr,
      sphere: b.sphere ?? "Autre",
      capacity: b.capaciteQuantite ?? 0,
      assignment_type: b.capaciteType ?? "",
      domain_limitation: b.limitation,
      structure_points: b.pointsStructure ?? 0,
      notes: b.effetTexte,
      statut: b.statut,
      construction_costs: constructionCostsByBatiment.get(b.id) ?? {},
    }))
    .sort((a, b) => a.sphere.localeCompare(b.sphere, "fr") || a.name.localeCompare(b.name, "fr"));

  return NextResponse.json(result);
}
