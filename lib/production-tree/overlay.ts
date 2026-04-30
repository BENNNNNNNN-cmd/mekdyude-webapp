/**
 * Phase 2 — overlay layer.
 *
 * Annotates each BuildingTreeEntry in a forward tree with the guild's
 * live state: where it's already built (✓), where it could be built (⚠),
 * where it's blocked and why (✗).
 *
 * Reuses lib/construction.ts:checkConstructionFeasibility per (building,
 * domain) pair — that's our single source of truth for the rules.
 */

import { getDb } from "@/db";
import { checkConstructionFeasibility } from "@/lib/construction";
import { getBatimentById } from "@/lib/reference-postgres";
import type {
  BuildingOverlay,
  BuiltInstance,
  CardNode,
  DomainCandidate,
} from "./types";

interface DomainRow {
  id: string;
  name: string;
  guild_id: string;
}

/**
 * Annotate every building entry in a forward tree with overlay info,
 * scoped to the given guild's domains. Mutates `tree` in place.
 */
export async function annotateForward(tree: CardNode, guildId: string): Promise<CardNode> {
  const db = getDb();
  const domains = db
    .prepare("SELECT id, name, guild_id FROM domains WHERE guild_id = ? ORDER BY name")
    .all(guildId) as DomainRow[];

  if (domains.length === 0) return tree;

  const cache = new Map<string, BuildingOverlay>();
  const visited = new WeakSet<CardNode>();
  await walk(tree);
  return tree;

  async function walk(node: CardNode): Promise<void> {
    if (visited.has(node)) return;
    visited.add(node);
    if (node.alreadyShown) return;
    for (const b of node.buildings) {
      let overlay = cache.get(b.building.id);
      if (!overlay) {
        overlay = await computeOverlay(b.building.id, b.building.name, domains);
        cache.set(b.building.id, overlay);
      }
      b.overlay = overlay;
      for (const o of b.outputs) await walk(o.child);
    }
  }
}

async function computeOverlay(
  buildingId: string,
  buildingName: string,
  domains: DomainRow[]
): Promise<BuildingOverlay> {
  const db = getDb();
  const builtOn: BuiltInstance[] = [];
  const buildableOn: DomainCandidate[] = [];
  const blockedOn: DomainCandidate[] = [];

  const existsStmt = db.prepare(
    "SELECT assigned_count FROM domain_buildings WHERE domain_id = ? AND building_template_id = ?"
  );
  const batiment = await getBatimentById(buildingId);
  const capacity = batiment?.capaciteQuantite ?? 0;

  for (const d of domains) {
    const existing = existsStmt.get(d.id, buildingId) as { assigned_count: number } | undefined;
    if (existing) {
      builtOn.push({
        domain_id: d.id,
        domain_name: d.name,
        assigned_count: existing.assigned_count,
        capacity,
      });
      continue;
    }

    const result = await checkConstructionFeasibility(buildingId, d.id);
    const reasons = result.reasons.filter((r) => !r.startsWith("Déjà construit"));

    if (reasons.length === 0) {
      buildableOn.push({ domain_id: d.id, domain_name: d.name, reasons: [] });
    } else {
      blockedOn.push({ domain_id: d.id, domain_name: d.name, reasons });
    }
  }

  const status: BuildingOverlay["status"] =
    builtOn.length > 0 ? "built" : buildableOn.length > 0 ? "buildable" : "blocked";

  const summary = buildSummary(buildingName, status, builtOn, buildableOn, blockedOn);

  return { status, builtOn, buildableOn, blockedOn, summary };
}

function buildSummary(
  buildingName: string,
  status: BuildingOverlay["status"],
  built: BuiltInstance[],
  buildable: DomainCandidate[],
  blocked: DomainCandidate[]
): string {
  if (status === "built") {
    const list = built
      .map((b) => `${b.domain_name} (${b.assigned_count}/${b.capacity})`)
      .join(", ");
    const otherDomains = buildable.length + blocked.length;
    const tail = otherDomains > 0
      ? buildable.length > 0
        ? ` — constructible aussi sur ${buildable.length} autre(s)`
        : ""
      : "";
    return `Construit sur ${list}${tail}`;
  }
  if (status === "buildable") {
    const where = buildable.map((d) => d.domain_name).join(", ");
    return `Constructible sur ${where}`;
  }
  // blocked
  if (blocked.length === 0) return `${buildingName} : aucun domaine compatible`;
  // Most common blocking reason
  const reasonCounts = new Map<string, number>();
  for (const d of blocked) {
    for (const r of d.reasons) reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }
  const topReason = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return `Bloqué sur tous les domaines : ${topReason ?? "raison inconnue"}`;
}
