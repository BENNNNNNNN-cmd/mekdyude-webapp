/**
 * Phase 3 — Reverse planner.
 *
 * Translates a "I need N of card Y per year" target into a ranked list of
 * concrete actionable options grounded in your real guild state:
 *   - Staff up an existing under-staffed building
 *   - Build a new instance on a domain that can host it
 *
 * For each option, we surface:
 *   - The annual yield delta it provides
 *   - The construction cost (if building new) vs your inventory
 *   - The blocking reasons (if any)
 *   - Whether the upstream chain is satisfied (e.g. "needs +20 Paysan")
 *
 * Scoring is in scoring.ts.
 */

import { getDb } from "@/db";
import { loadRepo, type Repo } from "./engine";
import { checkConstructionFeasibility } from "@/lib/construction";
import {
  computeProduction,
  getProductionSummary,
  isMultiOutputProduction,
} from "@/lib/production";
import { scoreOption, sortOptions } from "./scoring";
import { normalizeName } from "@/lib/reference-postgres";
import type { Card } from "./types";

export interface ReversePlan {
  target: { card_id: string; card_title: string; needed_qty: number };
  baseline: {
    current_production: number;
    breakdown: Array<{
      domain_name: string;
      building_name: string;
      assigned: number;
      capacity: number;
      amount: number;
    }>;
  };
  gap: number;
  options: ReverseOption[];
  unreachable_producers: string[];
}

export type ReverseOption = StaffUpOption | BuildNewOption;

interface BaseOption {
  id: string;
  kind: "staff_up" | "build_new";
  building_id: string;
  building_name: string;
  building_sphere: string;
  domain_id: string;
  domain_name: string;
  yield_per_year: number;
  score: number;
  notes: string[];
  upstream_demand: UpstreamDemand[];
}

export interface UpstreamDemand {
  card_title: string;
  qty: number;
  satisfied: boolean;
}

export interface StaffUpOption extends BaseOption {
  kind: "staff_up";
  current_assigned: number;
  capacity: number;
  additional_units_needed: number;
  yield_at_full_capacity: number;
}

export interface BuildNewOption extends BaseOption {
  kind: "build_new";
  costs: Array<{
    resource: string;
    required: number;
    available: number;
    status: "ok" | "missing" | "manual";
  }>;
  blocked_reasons: string[];
}

const DEFAULT_GUILD_ID = "mek_dyude";

export async function computeReversePlan(
  targetCardId: string,
  neededQty: number,
  guildId: string = DEFAULT_GUILD_ID
): Promise<ReversePlan | null> {
  const repo = await loadRepo();
  const card = repo.getCard(targetCardId);
  if (!card) return null;

  const baseline = await computeBaseline(card.title, guildId);
  const gap = Math.max(0, neededQty - baseline.current_production);

  const producers = repo.buildingsProducing(targetCardId);
  const cards = repo.listCards();
  const cardByTitle = new Map<string, Card>();
  for (const c of cards) cardByTitle.set(c.title, c);

  const options: ReverseOption[] = [];
  const unreachable: string[] = [];

  for (const producer of producers) {
    const buildingOpts = await optionsForProducer(
      repo,
      producer.id,
      targetCardId,
      gap,
      guildId,
      cardByTitle
    );
    if (buildingOpts.length === 0) {
      unreachable.push(producer.name);
    } else {
      options.push(...buildingOpts);
    }
  }

  return {
    target: { card_id: targetCardId, card_title: card.title, needed_qty: neededQty },
    baseline,
    gap,
    options: sortOptions(options),
    unreachable_producers: unreachable,
  };
}

async function computeBaseline(targetCardTitle: string, guildId: string) {
  const production = await computeProduction(guildId);
  const breakdown: ReversePlan["baseline"]["breakdown"] = [];
  let total = 0;

  const targetNorm = normalizeName(targetCardTitle).replace(/s$/, "");

  for (const entry of production) {
    if (isMultiOutputProduction(entry)) {
      for (const line of entry.lines) {
        if (normalizeName(line.resource).replace(/s$/, "") === targetNorm) {
          total += line.amount;
          breakdown.push({
            domain_name: entry.domainName,
            building_name: entry.buildingName,
            assigned: entry.assignedCount,
            capacity: entry.capacity,
            amount: line.amount,
          });
        }
      }
    } else if (
      normalizeName(entry.resource).replace(/s$/, "") === targetNorm &&
      entry.amount > 0
    ) {
      total += entry.amount;
      breakdown.push({
        domain_name: entry.domainName,
        building_name: entry.buildingName,
        assigned: entry.assignedCount,
        capacity: entry.capacity,
        amount: entry.amount,
      });
    }
  }

  return { current_production: total, breakdown };
}

async function optionsForProducer(
  repo: Repo,
  buildingId: string,
  targetCardId: string,
  gap: number,
  guildId: string,
  cardByTitle: Map<string, Card>
): Promise<ReverseOption[]> {
  const db = getDb();
  const options: ReverseOption[] = [];

  const building = repo.getBuilding(buildingId);
  if (!building) return options;

  const output = building.outputs.find((o) => o.card_id === targetCardId);
  if (!output) return options;

  const perInput = output.quantity_per_input / Math.max(1, output.input_divisor);
  const primaryInput = building.inputs[0];
  const buildingCapacity = primaryInput?.max_quantity ?? 0;

  const existingInstances = db
    .prepare(
      `SELECT db.domain_id, db.assigned_count, d.name AS domain_name
       FROM domain_buildings db
       JOIN domains d ON d.id = db.domain_id
       WHERE db.building_template_id = ? AND d.guild_id = ?`
    )
    .all(buildingId, guildId) as Array<{
    domain_id: string;
    assigned_count: number;
    domain_name: string;
  }>;

  for (const inst of existingInstances) {
    const room = buildingCapacity - inst.assigned_count;
    if (room <= 0) continue;

    const unitsToCloseGap = perInput > 0 ? Math.ceil(gap / perInput) : 0;
    const unitsToAssign = Math.min(room, Math.max(1, unitsToCloseGap));
    const yieldDelta = unitsToAssign * perInput;
    const yieldAtFull = room * perInput;

    const upstream: UpstreamDemand[] = primaryInput
      ? [await buildUpstreamDemand(primaryInput.card_title, unitsToAssign, cardByTitle, guildId)]
      : [];

    const notes: string[] = [];
    if (room === buildingCapacity) notes.push("Bâtiment vide — staffing complet recommandé");
    else notes.push(`${inst.assigned_count}/${buildingCapacity} actuellement staffé`);
    if (yieldDelta < gap)
      notes.push(`Couvre seulement ${yieldDelta}/${gap} du besoin (capacité limitée)`);

    const opt: StaffUpOption = {
      id: `staff_${buildingId}_${inst.domain_id}`,
      kind: "staff_up",
      building_id: buildingId,
      building_name: building.name,
      building_sphere: building.sphere,
      domain_id: inst.domain_id,
      domain_name: inst.domain_name,
      current_assigned: inst.assigned_count,
      capacity: buildingCapacity,
      additional_units_needed: unitsToAssign,
      yield_per_year: yieldDelta,
      yield_at_full_capacity: yieldAtFull,
      score: 0,
      notes,
      upstream_demand: upstream,
    };
    opt.score = scoreOption(opt, gap);
    options.push(opt);
  }

  const allDomains = db
    .prepare("SELECT id, name FROM domains WHERE guild_id = ? ORDER BY name")
    .all(guildId) as Array<{ id: string; name: string }>;
  const existingDomainIds = new Set(existingInstances.map((i) => i.domain_id));

  for (const d of allDomains) {
    if (existingDomainIds.has(d.id)) continue;
    const result = await checkConstructionFeasibility(buildingId, d.id);
    const reasons = result.reasons.filter((r) => !r.startsWith("Déjà construit"));

    const unitsToCloseGap = perInput > 0 ? Math.ceil(gap / perInput) : 0;
    const unitsToAssign = Math.min(
      buildingCapacity || unitsToCloseGap,
      Math.max(1, unitsToCloseGap)
    );
    const yieldDelta = unitsToAssign * perInput;

    const upstream: UpstreamDemand[] = primaryInput
      ? [await buildUpstreamDemand(primaryInput.card_title, unitsToAssign, cardByTitle, guildId)]
      : [];

    const notes: string[] = [];
    if (yieldDelta < gap)
      notes.push(`À pleine cap. (${buildingCapacity}/${buildingCapacity}), couvre ${yieldDelta}/${gap}`);
    if (output.full_capacity_bonus > 0)
      notes.push(`+${output.full_capacity_bonus} bonus pleine capacité`);

    const opt: BuildNewOption = {
      id: `build_${buildingId}_${d.id}`,
      kind: "build_new",
      building_id: buildingId,
      building_name: building.name,
      building_sphere: building.sphere,
      domain_id: d.id,
      domain_name: d.name,
      yield_per_year: yieldDelta,
      score: 0,
      notes,
      upstream_demand: upstream,
      costs: result.costs,
      blocked_reasons: reasons,
    };
    opt.score = scoreOption(opt, gap);
    options.push(opt);
  }

  return options;
}

async function buildUpstreamDemand(
  cardTitle: string,
  qty: number,
  cardByTitle: Map<string, Card>,
  guildId: string
): Promise<UpstreamDemand> {
  const card = cardByTitle.get(cardTitle);
  if (!card) {
    return { card_title: cardTitle, qty, satisfied: false };
  }

  const { totals } = await getProductionSummary(guildId);
  const targetNorm = normalizeName(cardTitle).replace(/s$/, "");
  let currentForCard = 0;
  for (const [resource, amount] of Object.entries(totals)) {
    if (normalizeName(resource).replace(/s$/, "") === targetNorm) currentForCard += amount;
  }
  return { card_title: cardTitle, qty, satisfied: currentForCard >= qty };
}
