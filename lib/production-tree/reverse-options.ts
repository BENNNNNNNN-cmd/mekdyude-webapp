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

import type Database from "better-sqlite3";
import { listAllCards, getCardById } from "./engine";
import { checkConstructionFeasibility } from "@/lib/construction";
import { computeProduction, isAbbayeProduction } from "@/lib/production";
import { scoreOption, sortOptions } from "./scoring";

export interface ReversePlan {
  target: { card_id: number; card_title: string; needed_qty: number };
  baseline: {
    current_production: number;
    /** All current producer breakdowns (which building on which domain). */
    breakdown: Array<{
      domain_name: string;
      building_name: string;
      assigned: number;
      capacity: number;
      amount: number;
    }>;
  };
  /** Need − current. Negative means surplus (the planner short-circuits then). */
  gap: number;
  options: ReverseOption[];
  /** Buildings that produce the target card but had zero applicable options
      (e.g. you don't own any domain where it could be built or staffed). */
  unreachable_producers: string[];
}

export type ReverseOption = StaffUpOption | BuildNewOption;

interface BaseOption {
  /** Stable id for React keys. */
  id: string;
  kind: "staff_up" | "build_new";
  building_id: string;
  building_name: string;
  building_sphere: string;
  domain_id: string;
  domain_name: string;
  /** Yearly output produced by this option (delta over current). */
  yield_per_year: number;
  /** Score (lower = simpler, higher = costlier). */
  score: number;
  /** Free-text reasons explaining the option. */
  notes: string[];
  /** Upstream demand created by taking this action: e.g. "needs +20 Paysan". */
  upstream_demand: UpstreamDemand[];
}

export interface UpstreamDemand {
  card_title: string;
  qty: number;
  /** Is your current production of this card sufficient to absorb the demand? */
  satisfied: boolean;
}

export interface StaffUpOption extends BaseOption {
  kind: "staff_up";
  current_assigned: number;
  capacity: number;
  /** How many additional units to assign to fully exploit OR meet the gap. */
  additional_units_needed: number;
  /** Yield if the building reaches full capacity (informational). */
  yield_at_full_capacity: number;
}

export interface BuildNewOption extends BaseOption {
  kind: "build_new";
  /** Cost lines from feasibility check. */
  costs: Array<{ resource: string; required: number; available: number; status: "ok" | "missing" | "manual" }>;
  /** Reasons it's blocked (empty if buildable). */
  blocked_reasons: string[];
}

const DEFAULT_GUILD_ID = "mek_dyude";

export function computeReversePlan(
  db: Database.Database,
  targetCardId: number,
  neededQty: number,
  guildId: string = DEFAULT_GUILD_ID
): ReversePlan | null {
  const card = getCardById(db, targetCardId);
  if (!card) return null;

  // Baseline: how much of the target are we currently producing across all domains?
  const baseline = computeBaseline(card.title, guildId);
  const gap = Math.max(0, neededQty - baseline.current_production);

  // Find buildings that can produce this card.
  const producerRows = db.prepare(
    `SELECT DISTINCT bt.id, bt.name, bt.sphere
     FROM building_outputs bo
     JOIN building_templates bt ON bt.id = bo.building_id
     WHERE bo.output_card_id = ?
     ORDER BY bt.name`
  ).all(targetCardId) as Array<{ id: string; name: string; sphere: string }>;

  const cards = listAllCards(db);
  const cardByTitle = new Map(cards.map((c) => [c.title, c]));

  const options: ReverseOption[] = [];
  const unreachable: string[] = [];

  for (const producer of producerRows) {
    const buildingOpts = optionsForProducer(
      db,
      producer.id,
      producer.name,
      producer.sphere,
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

// ---------------------------------------------------------------------------

function computeBaseline(targetCardTitle: string, _guildId: string) {
  const production = computeProduction();
  const breakdown: ReversePlan["baseline"]["breakdown"] = [];
  let total = 0;

  // Map both "Équipement" and "Équipements" — your local resource_produced
  // strings sometimes have plural forms. Match on prefix.
  const normalized = targetCardTitle.replace(/s$/, "").toLowerCase();

  for (const entry of production) {
    if (isAbbayeProduction(entry)) {
      for (const line of entry.lines) {
        if (line.resource.replace(/s$/, "").toLowerCase() === normalized) {
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
    } else {
      if (entry.resource.replace(/s$/, "").toLowerCase() === normalized && entry.amount > 0) {
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
  }

  return { current_production: total, breakdown };
}

function optionsForProducer(
  db: Database.Database,
  buildingId: string,
  buildingName: string,
  sphere: string,
  targetCardId: number,
  gap: number,
  guildId: string,
  cardByTitle: Map<string, { id: number; title: string; substitutes: number[] }>
): ReverseOption[] {
  const options: ReverseOption[] = [];

  // Output spec for this building → target card
  const output = db.prepare(
    `SELECT quantity_per_input, input_divisor, full_capacity_bonus
     FROM building_outputs
     WHERE building_id = ? AND output_card_id = ?`
  ).get(buildingId, targetCardId) as {
    quantity_per_input: number;
    input_divisor: number;
    full_capacity_bonus: number;
  } | undefined;

  if (!output) return options;

  // Per-input yield (e.g. Atelier: 5/Paysan)
  const perInput = output.quantity_per_input / Math.max(1, output.input_divisor);

  // Building's primary input card (most buildings have one).
  const inputs = db.prepare(
    `SELECT bi.input_card_id, bi.max_quantity, c.title
     FROM building_inputs bi
     JOIN cards c ON c.id = bi.input_card_id
     WHERE bi.building_id = ?`
  ).all(buildingId) as Array<{ input_card_id: number; max_quantity: number; title: string }>;

  const primaryInput = inputs[0];

  // === Existing instances: "staff up" options =================================
  const existingInstances = db.prepare(
    `SELECT db.domain_id, db.assigned_count, d.name as domain_name, bt.capacity
     FROM domain_buildings db
     JOIN domains d ON d.id = db.domain_id
     JOIN building_templates bt ON bt.id = db.building_template_id
     WHERE db.building_template_id = ? AND d.guild_id = ?`
  ).all(buildingId, guildId) as Array<{
    domain_id: string; assigned_count: number; domain_name: string; capacity: number;
  }>;

  for (const inst of existingInstances) {
    const room = inst.capacity - inst.assigned_count;
    if (room <= 0) continue;

    // How many more units do we actually need to assign?
    const unitsToCloseGap = perInput > 0 ? Math.ceil(gap / perInput) : 0;
    const unitsToAssign = Math.min(room, Math.max(1, unitsToCloseGap));
    const yieldDelta = unitsToAssign * perInput;
    const yieldAtFull = room * perInput;

    const upstream: UpstreamDemand[] = primaryInput
      ? [
          buildUpstreamDemand(primaryInput.title, unitsToAssign, cardByTitle),
        ]
      : [];

    const notes: string[] = [];
    if (room === inst.capacity) notes.push("Bâtiment vide — staffing complet recommandé");
    else notes.push(`${inst.assigned_count}/${inst.capacity} actuellement staffé`);
    if (yieldDelta < gap)
      notes.push(`Couvre seulement ${yieldDelta}/${gap} du besoin (capacité limitée)`);

    const opt: StaffUpOption = {
      id: `staff_${buildingId}_${inst.domain_id}`,
      kind: "staff_up",
      building_id: buildingId,
      building_name: buildingName,
      building_sphere: sphere,
      domain_id: inst.domain_id,
      domain_name: inst.domain_name,
      current_assigned: inst.assigned_count,
      capacity: inst.capacity,
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

  // === New instances on every domain that doesn't already have one ===========
  const allDomains = db.prepare(
    "SELECT id, name FROM domains WHERE guild_id = ? ORDER BY name"
  ).all(guildId) as Array<{ id: string; name: string }>;

  const existingDomainIds = new Set(existingInstances.map((i) => i.domain_id));

  for (const d of allDomains) {
    if (existingDomainIds.has(d.id)) continue;
    const result = checkConstructionFeasibility(buildingId, d.id);
    const reasons = result.reasons.filter((r) => !r.startsWith("Déjà construit"));

    const buildingCapacity = db.prepare(
      "SELECT capacity FROM building_templates WHERE id = ?"
    ).get(buildingId) as { capacity: number } | undefined;
    const cap = buildingCapacity?.capacity ?? 0;

    const unitsToCloseGap = perInput > 0 ? Math.ceil(gap / perInput) : 0;
    const unitsToAssign = Math.min(cap || unitsToCloseGap, Math.max(1, unitsToCloseGap));
    const yieldDelta = unitsToAssign * perInput;

    const upstream: UpstreamDemand[] = primaryInput
      ? [buildUpstreamDemand(primaryInput.title, unitsToAssign, cardByTitle)]
      : [];

    const notes: string[] = [];
    if (yieldDelta < gap)
      notes.push(`À pleine cap. (${cap}/${cap}), couvre ${yieldDelta}/${gap}`);
    if (output.full_capacity_bonus > 0)
      notes.push(`+${output.full_capacity_bonus} bonus pleine capacité`);

    const opt: BuildNewOption = {
      id: `build_${buildingId}_${d.id}`,
      kind: "build_new",
      building_id: buildingId,
      building_name: buildingName,
      building_sphere: sphere,
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

function buildUpstreamDemand(
  cardTitle: string,
  qty: number,
  cardByTitle: Map<string, { id: number; title: string; substitutes: number[] }>
): UpstreamDemand {
  // Best-effort satisfaction check: do we currently produce/have enough of
  // this card to absorb this demand? Rough — uses inventory + production
  // total without complex routing analysis. Phase 3+ could refine.
  const card = cardByTitle.get(cardTitle);
  if (!card) {
    return { card_title: cardTitle, qty, satisfied: false };
  }

  // For workers/units, current production + inventory is what matters.
  // For resources, we'd need the same. Use the production summary.
  const { totals } = require("@/lib/production").getProductionSummary() as {
    totals: Record<string, number>;
  };
  const currentForCard =
    totals[cardTitle] ?? totals[cardTitle + "s"] ?? totals[cardTitle.replace(/s$/, "")] ?? 0;
  return { card_title: cardTitle, qty, satisfied: currentForCard >= qty };
}
