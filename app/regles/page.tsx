import { ensureReferenceMigration } from "@/db";
import { getBatiments, getCouts } from "@/lib/reference-postgres";
import ReglesClient from "./ReglesClient";

export const dynamic = "force-dynamic";

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
  statut: string;
  construction_costs: Record<string, number>;
}

export default async function ReglesPage() {
  await ensureReferenceMigration();
  const [batiments, couts] = await Promise.all([getBatiments(), getCouts()]);

  const constructionCostsByBatiment = new Map<string, Record<string, number>>();
  for (const c of couts) {
    if (c.objetType !== "Bâtiment" || c.typeCout !== "Construction") continue;
    if (!c.composant || c.quantite === null) continue;
    const map = constructionCostsByBatiment.get(c.objetId) ?? {};
    map[c.composant] = (map[c.composant] ?? 0) + c.quantite;
    constructionCostsByBatiment.set(c.objetId, map);
  }

  const buildings: BuildingTemplate[] = batiments
    .map((b) => ({
      id: b.id,
      name: b.nameFr,
      sphere: b.sphere ?? "Autre",
      capacity: b.capaciteQuantite ?? 0,
      assignment_type: b.capaciteType ?? "",
      resource_produced: "",
      ratio_per_unit: 0,
      domain_limitation: b.limitation,
      prerequisite_building: null,
      structure_points: b.pointsStructure ?? 0,
      notes: b.effetTexte,
      statut: b.statut,
      construction_costs: constructionCostsByBatiment.get(b.id) ?? {},
    }))
    .sort((a, b) => a.sphere.localeCompare(b.sphere, "fr") || a.name.localeCompare(b.name, "fr"));

  const spheres = [...new Set(buildings.map((b) => b.sphere))].sort();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="font-serif text-3xl font-bold text-foreground">Règles — Bâtiments</h1>
      <p className="text-sm text-foreground/60">
        Référence des {buildings.length} bâtiments. Cliquez sur une ligne pour voir les coûts de construction.
      </p>
      <ReglesClient buildings={buildings} spheres={spheres} />
    </div>
  );
}
