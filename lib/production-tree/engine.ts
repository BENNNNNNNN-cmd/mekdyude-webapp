/**
 * Production-tree engine — pure functions over a Database.
 *
 * Two walks share the same data layer:
 *   - expandForward: card → buildings consuming it → outputs → recurse
 *   - expandReverse: target card → producers → required inputs → recurse
 *
 * Phase 1 wires expandForward into the UI. expandReverse is implemented but
 * not yet routed; Phase 3 will surface it.
 *
 * Loop detection: each recursive walk carries an `ancestry` set of card ids.
 * If a card's id is already in ancestry, the node is rendered with
 * `alreadyShown: true` and not expanded — same UX as bicolline.online's
 * "déjà affiché" badge.
 */

import type Database from "better-sqlite3";
import type {
  Card,
  BuildingNode,
  BuildingOutput,
  BuildingInput,
  OutputConstraint,
  CardNode,
  BuildingTreeEntry,
  OutputTreeEntry,
  ReverseNode,
  ReverseProducerEntry,
  ReverseInputEntry,
  TreeOptions,
} from "./types";

const DEFAULT_MAX_DEPTH = 6;

// =============================================================================
// Repository — all DB I/O lives here. Loaders cache per-engine call so a single
// tree expansion never re-queries the same row.
// =============================================================================

class Repo {
  private cardById = new Map<number, Card>();
  private allCardsLoaded = false;
  private buildingBySlug = new Map<string, BuildingNode>();
  private buildingsByInputCard = new Map<number, string[]>();
  private buildingsByOutputCard = new Map<number, string[]>();
  private indicesBuilt = false;

  constructor(private db: Database.Database) {}

  /** All cards (for the dropdown). Sorted by category then title. */
  listCards(): Card[] {
    this.ensureCardsLoaded();
    return [...this.cardById.values()].sort((a, b) => {
      const ca = a.category.padStart(2, "0");
      const cb = b.category.padStart(2, "0");
      if (ca !== cb) return ca.localeCompare(cb);
      return a.title.localeCompare(b.title, "fr");
    });
  }

  getCard(id: number): Card | null {
    this.ensureCardsLoaded();
    return this.cardById.get(id) ?? null;
  }

  /** Buildings whose `inputs` include cardId. */
  buildingsConsuming(cardId: number, includeSubstitutes: boolean): BuildingNode[] {
    this.ensureIndices();
    const targetCardIds = new Set<number>([cardId]);
    if (includeSubstitutes) {
      const card = this.cardById.get(cardId);
      if (card) for (const s of card.substitutes) targetCardIds.add(s);
    }
    const slugs = new Set<string>();
    for (const id of targetCardIds) {
      const fromIdx = this.buildingsByInputCard.get(id);
      if (fromIdx) for (const slug of fromIdx) slugs.add(slug);
    }
    const out: BuildingNode[] = [];
    for (const slug of slugs) {
      const b = this.buildingBySlug.get(slug);
      if (b) out.push(b);
    }
    out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return out;
  }

  /** Buildings whose `outputs` include cardId. */
  buildingsProducing(cardId: number): BuildingNode[] {
    this.ensureIndices();
    const slugs = this.buildingsByOutputCard.get(cardId) ?? [];
    const out: BuildingNode[] = [];
    for (const slug of slugs) {
      const b = this.buildingBySlug.get(slug);
      if (b) out.push(b);
    }
    out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return out;
  }

  // ---------------------------------------------------------------------------

  private ensureCardsLoaded() {
    if (this.allCardsLoaded) return;

    const cardRows = this.db
      .prepare("SELECT id, title, category FROM cards")
      .all() as Array<{ id: number; title: string; category: string }>;
    for (const r of cardRows) {
      this.cardById.set(r.id, { id: r.id, title: r.title, category: r.category, substitutes: [] });
    }

    const subRows = this.db
      .prepare("SELECT card_id, substitute_card_id FROM card_substitutes")
      .all() as Array<{ card_id: number; substitute_card_id: number }>;
    for (const r of subRows) {
      const card = this.cardById.get(r.card_id);
      if (card) card.substitutes.push(r.substitute_card_id);
    }

    this.allCardsLoaded = true;
  }

  private ensureIndices() {
    if (this.indicesBuilt) return;
    this.ensureCardsLoaded();

    // Buildings — single query, denormalized via grouped joins.
    const buildingRows = this.db
      .prepare(
        `SELECT id, name, sphere, bicolline_id FROM building_templates ORDER BY name`
      )
      .all() as Array<{ id: string; name: string; sphere: string; bicolline_id: number | null }>;
    for (const r of buildingRows) {
      this.buildingBySlug.set(r.id, {
        id: r.id,
        name: r.name,
        sphere: r.sphere,
        bicolline_id: r.bicolline_id,
        inputs: [],
        outputs: [],
      });
    }

    const inputRows = this.db
      .prepare("SELECT building_id, input_card_id, max_quantity FROM building_inputs")
      .all() as Array<{ building_id: string; input_card_id: number; max_quantity: number }>;
    for (const r of inputRows) {
      const b = this.buildingBySlug.get(r.building_id);
      if (!b) continue;
      const card = this.cardById.get(r.input_card_id);
      const entry: BuildingInput = {
        card_id: r.input_card_id,
        card_title: card?.title ?? `Card #${r.input_card_id}`,
        max_quantity: r.max_quantity,
      };
      b.inputs.push(entry);
      const idx = this.buildingsByInputCard.get(r.input_card_id) ?? [];
      idx.push(r.building_id);
      this.buildingsByInputCard.set(r.input_card_id, idx);
    }

    const outputRows = this.db
      .prepare(
        `SELECT building_id, output_card_id, quantity_per_input, input_divisor,
                full_capacity_bonus, use_domain_mineral, display_order
         FROM building_outputs ORDER BY building_id, display_order`
      )
      .all() as Array<{
      building_id: string;
      output_card_id: number;
      quantity_per_input: number;
      input_divisor: number;
      full_capacity_bonus: number;
      use_domain_mineral: number;
      display_order: number;
    }>;
    for (const r of outputRows) {
      const b = this.buildingBySlug.get(r.building_id);
      if (!b) continue;
      const card = this.cardById.get(r.output_card_id);
      const out: BuildingOutput = {
        card_id: r.output_card_id,
        card_title: card?.title ?? `Card #${r.output_card_id}`,
        quantity_per_input: r.quantity_per_input,
        input_divisor: r.input_divisor,
        full_capacity_bonus: r.full_capacity_bonus,
        use_domain_mineral: !!r.use_domain_mineral,
        display_order: r.display_order,
        constraints: [],
      };
      b.outputs.push(out);
      const idx = this.buildingsByOutputCard.get(r.output_card_id) ?? [];
      idx.push(r.building_id);
      this.buildingsByOutputCard.set(r.output_card_id, idx);
    }

    const constraintRows = this.db
      .prepare(
        `SELECT building_id, output_card_id, constraining_card_id, scope, numerator, denominator
         FROM building_output_constraints`
      )
      .all() as Array<{
      building_id: string;
      output_card_id: number;
      constraining_card_id: number;
      scope: "domain" | "fief" | "province" | "region";
      numerator: number;
      denominator: number;
    }>;
    for (const r of constraintRows) {
      const b = this.buildingBySlug.get(r.building_id);
      if (!b) continue;
      const out = b.outputs.find((o) => o.card_id === r.output_card_id);
      if (!out) continue;
      const card = this.cardById.get(r.constraining_card_id);
      const c: OutputConstraint = {
        constraining_card_id: r.constraining_card_id,
        constraining_card_title: card?.title ?? `Card #${r.constraining_card_id}`,
        scope: r.scope,
        numerator: r.numerator,
        denominator: r.denominator,
      };
      out.constraints.push(c);
    }

    this.indicesBuilt = true;
  }
}

// =============================================================================
// Forward walk
// =============================================================================

export function expandForward(
  db: Database.Database,
  rootCardId: number,
  options: TreeOptions = {}
): CardNode | null {
  const repo = new Repo(db);
  const root = repo.getCard(rootCardId);
  if (!root) return null;
  const opts = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    includeSubstitutes: options.includeSubstitutes ?? false,
  };
  return walkForward(repo, root, new Set(), 0, opts);
}

function walkForward(
  repo: Repo,
  card: Card,
  ancestry: Set<number>,
  depth: number,
  opts: { maxDepth: number; includeSubstitutes: boolean }
): CardNode {
  // Cycle / depth guards
  if (ancestry.has(card.id) || depth > opts.maxDepth) {
    return { kind: "card", card, buildings: [], alreadyShown: true };
  }

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(card.id);

  const buildings = repo.buildingsConsuming(card.id, opts.includeSubstitutes);
  const buildingEntries: BuildingTreeEntry[] = buildings.map((b) => {
    const outputs: OutputTreeEntry[] = b.outputs.map((o) => {
      const childCard = repo.getCard(o.card_id);
      const child: CardNode = childCard
        ? walkForward(repo, childCard, nextAncestry, depth + 1, opts)
        : { kind: "card", card: { id: o.card_id, title: o.card_title, category: "?", substitutes: [] }, buildings: [], alreadyShown: false };
      return { output: o, child };
    });
    return { building: b, matchedInputCardId: card.id, outputs };
  });

  return { kind: "card", card, buildings: buildingEntries, alreadyShown: false };
}

// =============================================================================
// Reverse walk (Phase 3 — implemented now, surfaced later)
// =============================================================================

export function expandReverse(
  db: Database.Database,
  targetCardId: number,
  neededQty: number,
  options: TreeOptions = {}
): ReverseNode | null {
  const repo = new Repo(db);
  const root = repo.getCard(targetCardId);
  if (!root) return null;
  const opts = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    includeSubstitutes: options.includeSubstitutes ?? false,
  };
  return walkReverse(repo, root, neededQty, new Set(), 0, opts);
}

function walkReverse(
  repo: Repo,
  card: Card,
  neededQty: number,
  ancestry: Set<number>,
  depth: number,
  opts: { maxDepth: number; includeSubstitutes: boolean }
): ReverseNode {
  if (ancestry.has(card.id) || depth > opts.maxDepth) {
    return { kind: "reverse", card, needed_qty: neededQty, producers: [], alreadyShown: true };
  }
  const nextAncestry = new Set(ancestry);
  nextAncestry.add(card.id);

  const producers = repo.buildingsProducing(card.id);
  const producerEntries: ReverseProducerEntry[] = producers.flatMap((b) => {
    const matchingOutputs = b.outputs.filter((o) => o.card_id === card.id);
    return matchingOutputs.map<ReverseProducerEntry>((output) => {
      // qty per input = quantity_per_input / input_divisor
      // need = neededQty → required_input_units = ceil(neededQty * input_divisor / quantity_per_input)
      const perInput = output.quantity_per_input / Math.max(1, output.input_divisor);
      const requiredInputUnits =
        perInput > 0 ? Math.ceil(neededQty / perInput) : 0;

      const inputs: ReverseInputEntry[] = b.inputs.map((i) => {
        const inCard = repo.getCard(i.card_id);
        if (!inCard) {
          return {
            input: i,
            child: {
              kind: "reverse",
              card: { id: i.card_id, title: i.card_title, category: "?", substitutes: [] },
              needed_qty: requiredInputUnits,
              producers: [],
              alreadyShown: false,
            },
          };
        }
        return {
          input: i,
          child: walkReverse(repo, inCard, requiredInputUnits, nextAncestry, depth + 1, opts),
        };
      });

      return { building: b, output, required_input_units: requiredInputUnits, inputs };
    });
  });

  return { kind: "reverse", card, needed_qty: neededQty, producers: producerEntries, alreadyShown: false };
}

// =============================================================================
// Convenience helpers for API routes
// =============================================================================

export function listAllCards(db: Database.Database): Card[] {
  return new Repo(db).listCards();
}

export function getCardById(db: Database.Database, id: number): Card | null {
  return new Repo(db).getCard(id);
}
