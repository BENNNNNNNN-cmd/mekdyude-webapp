import { getDb } from "@/db";
import { getBatimentById, getCoutsForBatiment, normalizeName } from "@/lib/reference-postgres";

export interface FeasibilityLine {
  resource: string;
  required: number;
  available: number;
  status: "ok" | "missing" | "manual";
}

export interface FeasibilityResult {
  buildingName: string;
  domainName: string;
  canBuild: boolean;
  reasons: string[];
  costs: FeasibilityLine[];
}

const MANUAL_COMPOSANT_PREFIXES = ["main", "influence"];

function isManualComposant(composant: string): boolean {
  const norm = normalizeName(composant);
  return MANUAL_COMPOSANT_PREFIXES.some((p) => norm.startsWith(p));
}

export async function checkConstructionFeasibility(
  buildingId: string,
  domainId: string
): Promise<FeasibilityResult> {
  const db = getDb();

  const [batiment, costRows] = await Promise.all([
    getBatimentById(buildingId),
    getCoutsForBatiment(buildingId, "Construction"),
  ]);

  const domain = db
    .prepare("SELECT * FROM domains WHERE id = ?")
    .get(domainId) as
    | {
        id: string;
        name: string;
        production_type: string;
        is_coastal: number;
        deposit_type: string | null;
        deposit_size: string | null;
        buildings_used: number;
        buildings_max: number;
        guild_id: string;
      }
    | undefined;

  if (!batiment || !domain) {
    return {
      buildingName: batiment?.nameFr || buildingId,
      domainName: domain?.name || domainId,
      canBuild: false,
      reasons: ["Bâtiment ou domaine introuvable"],
      costs: [],
    };
  }

  const reasons: string[] = [];

  if (domain.buildings_used >= domain.buildings_max) {
    reasons.push("Aucun emplacement libre");
  }

  const existing = db
    .prepare("SELECT id FROM domain_buildings WHERE domain_id = ? AND building_template_id = ?")
    .get(domainId, buildingId);
  if (existing) {
    reasons.push("Déjà construit sur ce domaine");
  }

  if (batiment.limitation) {
    const lim = batiment.limitation.toLowerCase();
    if (lim.includes("prod. domaine:") || lim.includes("production du domaine")) {
      const m = lim.match(/(?:prod\. domaine\s*:|production du domaine\s*:)\s*([^.]+)/);
      const requiredType = m?.[1]?.trim() ?? "";
      const requiredStem = requiredType.replace(/s$/, "").substring(0, 4);
      if (requiredStem && !domain.production_type.toLowerCase().includes(requiredStem)) {
        reasons.push(`Requiert production domaine: ${batiment.limitation}`);
      }
    }
    if (lim.includes("grand gisement") && domain.deposit_size !== "Grand") {
      reasons.push("Requiert un grand gisement");
    }
    if (lim.includes("petit gisement") && !domain.deposit_size) {
      reasons.push("Requiert un gisement");
    }
    if ((lim.includes("domaine côtier") || lim.includes("cotier")) && !domain.is_coastal) {
      reasons.push("Requiert un domaine côtier");
    }
  }

  // Prerequisites: Phase 1 schema doesn't surface prerequiseCarteId as a
  // structured column. Skip the check until the workbook adds it.
  // TODO: parse Batiment.limitation for "Prérequis: X" patterns when available.

  const inventory = db
    .prepare(
      "SELECT item_name, qty_coffre, qty_en_mains FROM inventory WHERE guild_id = ?"
    )
    .all(domain.guild_id) as Array<{
    item_name: string;
    qty_coffre: number;
    qty_en_mains: number;
  }>;

  const invMap: Record<string, number> = {};
  for (const item of inventory) {
    invMap[normalizeName(item.item_name)] = item.qty_coffre + item.qty_en_mains;
  }

  const costLines: FeasibilityLine[] = costRows.map((c) => {
    const composant = c.composant ?? "(inconnu)";
    const required = c.quantite ?? 0;
    const isManual = isManualComposant(composant);
    const available = isManual ? 0 : invMap[normalizeName(composant)] ?? 0;
    return {
      resource: composant,
      required,
      available,
      status: isManual ? "manual" : available >= required ? "ok" : "missing",
    };
  });

  if (costLines.some((c) => c.status === "missing")) {
    reasons.push("Ressources insuffisantes");
  }

  return {
    buildingName: batiment.nameFr,
    domainName: domain.name,
    canBuild: reasons.length === 0,
    reasons,
    costs: costLines,
  };
}
