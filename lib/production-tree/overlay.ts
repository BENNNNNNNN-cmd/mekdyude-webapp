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

import type Database from "better-sqlite3";
import { checkConstructionFeasibility } from "@/lib/construction";
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
export function annotateForward(
  db: Database.Database,
  tree: CardNode,
  guildId: string
): CardNode {
  const domains = db
    .prepare("SELECT id, name, guild_id FROM domains WHERE guild_id = ? ORDER BY name")
    .all(guildId) as DomainRow[];

  if (domains.length === 0) return tree; // nothing to annotate against

  const cache = new Map<string, BuildingOverlay>();
  const visited = new WeakSet<CardNode>();
  walk(tree);
  return tree;

  function walk(node: CardNode) {
    if (visited.has(node)) return; // safety against shared subtrees
    visited.add(node);
    if (node.alreadyShown) return;
    for (const b of node.buildings) {
      let overlay = cache.get(b.building.id);
      if (!overlay) {
        overlay = computeOverlay(db, b.building.id, b.building.name, domains);
        cache.set(b.building.id, overlay);
      }
      b.overlay = overlay;
      for (const o of b.outputs) walk(o.child);
    }
  }
}

function computeOverlay(
  db: Database.Database,
  buildingId: string,
  buildingName: string,
  domains: DomainRow[]
): BuildingOverlay {
  // Check construction feasibility per domain. Note: feasibility logic flags
  // "Déjà construit sur ce domaine" as a reason — for the overlay we want to
  // pull that out as a SEPARATE classification (built), not treat it as blocked.
  const builtOn: BuiltInstance[] = [];
  const buildableOn: DomainCandidate[] = [];
  const blockedOn: DomainCandidate[] = [];

  // For each domain, determine if the building exists already (separate query
  // — feasibility check returns it as a reason but we want it classified).
  const existsStmt = db.prepare(
    "SELECT assigned_count FROM domain_buildings WHERE domain_id = ? AND building_template_id = ?"
  );
  const buildingStmt = db.prepare(
    "SELECT capacity FROM building_templates WHERE id = ?"
  );

  for (const d of domains) {
    const existing = existsStmt.get(d.id, buildingId) as { assigned_count: number } | undefined;
    if (existing) {
      const cap = (buildingStmt.get(buildingId) as { capacity: number } | undefined)?.capacity ?? 0;
      builtOn.push({
        domain_id: d.id,
        domain_name: d.name,
        assigned_count: existing.assigned_count,
        capacity: cap,
      });
      continue;
    }

    const result = checkConstructionFeasibility(buildingId, d.id);
    // Drop the "already built" reason if it slipped through (shouldn't, since
    // we just confirmed no existing row). Keep the rest.
    const reasons = result.reasons.filter(
      (r) => !r.startsWith("Déjà construit")
    );

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
