import { getDb } from "@/db";

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

export function checkConstructionFeasibility(
  buildingId: string,
  domainId: string
): FeasibilityResult {
  const db = getDb();

  const building = db.prepare(`
    SELECT * FROM building_templates WHERE id = ?
  `).get(buildingId) as {
    id: string; name: string; capacity: number; domain_limitation: string | null;
    prerequisite_building: string | null; assignment_type: string;
  } | undefined;

  const domain = db.prepare(`
    SELECT * FROM domains WHERE id = ?
  `).get(domainId) as {
    id: string; name: string; production_type: string; is_coastal: number;
    deposit_type: string | null; deposit_size: string | null;
    buildings_used: number; buildings_max: number; guild_id: string;
  } | undefined;

  if (!building || !domain) {
    return {
      buildingName: building?.name || buildingId,
      domainName: domain?.name || domainId,
      canBuild: false,
      reasons: ["Bâtiment ou domaine introuvable"],
      costs: [],
    };
  }

  const reasons: string[] = [];

  // Check building slots
  if (domain.buildings_used >= domain.buildings_max) {
    reasons.push("Aucun emplacement libre");
  }

  // Check if already built
  const existing = db.prepare(`
    SELECT id FROM domain_buildings WHERE domain_id = ? AND building_template_id = ?
  `).get(domainId, buildingId);
  if (existing) {
    reasons.push("Déjà construit sur ce domaine");
  }

  // Check domain limitation
  if (building.domain_limitation) {
    const lim = building.domain_limitation.toLowerCase();
    if (lim.includes("prod. domaine:")) {
      const requiredType = lim.replace("prod. domaine:", "").trim();
      if (!domain.production_type.toLowerCase().includes(requiredType.replace("s", "").substring(0, 4))) {
        reasons.push(`Requiert production domaine: ${building.domain_limitation}`);
      }
    }
    if (lim.includes("grand gisement")) {
      if (domain.deposit_size !== "Grand") {
        reasons.push("Requiert un grand gisement");
      }
    }
    if (lim.includes("petit gisement")) {
      if (!domain.deposit_size) {
        reasons.push("Requiert un gisement");
      }
    }
    if (lim.includes("domaine côtier") || lim.includes("cotier")) {
      if (!domain.is_coastal) {
        reasons.push("Requiert un domaine côtier");
      }
    }
  }

  // Check prerequisite
  if (building.prerequisite_building) {
    const prereqExists = db.prepare(`
      SELECT id FROM domain_buildings WHERE domain_id = ? AND building_template_id = ?
    `).get(domainId, building.prerequisite_building);
    if (!prereqExists) {
      const prereqBuilding = db.prepare(
        "SELECT name FROM building_templates WHERE id = ?"
      ).get(building.prerequisite_building) as { name: string } | undefined;
      reasons.push(`Prérequis manquant: ${prereqBuilding?.name || building.prerequisite_building}`);
    }
  }

  // Check costs
  const costs = db.prepare(`
    SELECT resource_type, amount FROM construction_costs WHERE building_id = ?
  `).all(buildingId) as Array<{ resource_type: string; amount: number }>;

  const inventory = db.prepare(`
    SELECT item_name, qty_coffre, qty_en_mains FROM inventory WHERE guild_id = ?
  `).all(domain.guild_id) as Array<{ item_name: string; qty_coffre: number; qty_en_mains: number }>;

  const invMap: Record<string, number> = {};
  for (const item of inventory) {
    invMap[item.item_name.toLowerCase()] = item.qty_coffre + item.qty_en_mains;
  }

  const resourceDisplayMap: Record<string, string> = {
    solaris: "Solaris",
    mo: "Main-d'œuvre",
    ressources: "Ressources",
    equipements: "Équipements",
    armements: "Armement",
    macons: "Maçon",
    charpentiers: "Charpentier",
    forgerons: "Forgeron",
    ingenieurs: "Ingénieur",
    intendants: "Intendant",
    croyants: "Croyant",
    marins: "Marin",
    scribes: "Scribe",
    laborantins: "Laborantins",
    mentor_mil: "Mentor Mil.",
    mentor_avent: "Aventurier",
    influences_reg: "Influences rég.",
  };

  const manualResources = ["mo", "influences_reg"];

  const costLines: FeasibilityLine[] = costs.map((c) => {
    const displayName = resourceDisplayMap[c.resource_type] || c.resource_type;
    const isManual = manualResources.includes(c.resource_type);
    const available = isManual ? 0 : (invMap[displayName.toLowerCase()] ?? 0);

    return {
      resource: displayName,
      required: c.amount,
      available: isManual ? 0 : available,
      status: isManual ? "manual" : available >= c.amount ? "ok" : "missing",
    };
  });

  const hasMissingCost = costLines.some((c) => c.status === "missing");
  if (hasMissingCost) {
    reasons.push("Ressources insuffisantes");
  }

  return {
    buildingName: building.name,
    domainName: domain.name,
    canBuild: reasons.length === 0,
    reasons,
    costs: costLines,
  };
}
