/**
 * Production-tree engine — pure async functions over Postgres reference data.
 *
 * Two walks share the same data layer:
 *   - expandForward: card → buildings consuming it → outputs → recurse
 *   - expandReverse: target card → producers → required inputs → recurse
 *
 * Loop detection: each recursive walk carries an `ancestry` set of card ids.
 * If a card's id is already in ancestry, the node is rendered with
 * `alreadyShown: true` and not expanded — same UX as bicolline.online's
 * "déjà affiché" badge.
 *
 * Phase 2: data comes from `lib/reference-postgres.ts` (Carte, Batiment,
 * Effet) instead of SQLite. The Repo loader derives MekDyude-shaped
 * structured fields from Postgres prose via `parse-production.ts`.
 */

import type {
  Card,
  BuildingNode,
  BuildingOutput,
  BuildingInput,
  CardNode,
  BuildingTreeEntry,
  OutputTreeEntry,
  ReverseNode,
  ReverseProducerEntry,
  ReverseInputEntry,
  TreeOptions,
} from "./types";
import {
  getBatiments,
  getCartes,
  getEffets,
  normalizeName,
  type Batiment,
  type Carte,
  type Effet,
} from "../reference-postgres";
import { getCardSubstitutes } from "../card-substitutes";
import { parseProductionText } from "./parse-production";

const DEFAULT_MAX_DEPTH = 6;

// =============================================================================
// Repository — all Postgres I/O lives here. A single Repo instance is reused
// across an entire tree expansion, so we never re-derive from raw rows twice.
// Top-level Postgres reads are cached for 5 min in `reference-postgres.ts`.
// =============================================================================

export class Repo {
  private cardById = new Map<string, Card>();
  private buildingById = new Map<string, BuildingNode>();
  private buildingsByInputCard = new Map<string, string[]>();
  private buildingsByOutputCard = new Map<string, string[]>();

  static async load(): Promise<Repo> {
    const repo = new Repo();
    const [cartes, batiments, effets, substitutes] = await Promise.all([
      getCartes(),
      getBatiments(),
      getEffets(),
      getCardSubstitutes(),
    ]);

    const carteByNormalizedName = buildCarteNameIndex(cartes);

    for (const c of cartes) {
      repo.cardById.set(c.id, {
        id: c.id,
        title: c.nameFr,
        category: c.famille,
        statut: c.statut,
        substitutes: substitutes.get(c.id) ?? [],
      });
    }

    for (const b of batiments) {
      const node: BuildingNode = {
        id: b.id,
        name: b.nameFr,
        sphere: b.sphere ?? "Autre",
        statut: b.statut,
        inputs: deriveInputs(b, carteByNormalizedName),
        outputs: deriveOutputs(b, effets, carteByNormalizedName),
      };
      repo.buildingById.set(b.id, node);
      for (const input of node.inputs) {
        appendList(repo.buildingsByInputCard, input.card_id, b.id);
      }
      for (const output of node.outputs) {
        appendList(repo.buildingsByOutputCard, output.card_id, b.id);
      }
    }

    return repo;
  }

  /** All cards (for the dropdown). Sorted by category then title. */
  listCards(): Card[] {
    return [...this.cardById.values()].sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category, "fr");
      return a.title.localeCompare(b.title, "fr");
    });
  }

  getCard(id: string): Card | null {
    return this.cardById.get(id) ?? null;
  }

  getBuilding(id: string): BuildingNode | null {
    return this.buildingById.get(id) ?? null;
  }

  /** Buildings whose `inputs` include cardId (or any of its substitutes if requested). */
  buildingsConsuming(cardId: string, includeSubstitutes: boolean): BuildingNode[] {
    const targetCardIds = new Set<string>([cardId]);
    if (includeSubstitutes) {
      const card = this.cardById.get(cardId);
      if (card) for (const s of card.substitutes) targetCardIds.add(s);
    }
    const ids = new Set<string>();
    for (const id of targetCardIds) {
      const fromIdx = this.buildingsByInputCard.get(id);
      if (fromIdx) for (const buildingId of fromIdx) ids.add(buildingId);
    }
    return [...ids]
      .map((id) => this.buildingById.get(id))
      .filter((b): b is BuildingNode => b !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }

  /** Buildings whose `outputs` include cardId. */
  buildingsProducing(cardId: string): BuildingNode[] {
    const ids = this.buildingsByOutputCard.get(cardId) ?? [];
    return ids
      .map((id) => this.buildingById.get(id))
      .filter((b): b is BuildingNode => b !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
}

// ---------------------------------------------------------------------------
// Derivation: Postgres rows → MekDyude calculator shape
// ---------------------------------------------------------------------------

/**
 * Per-word plural-tolerant normalization. "Fiches de population" and
 * "fiche de population" both map to "fiche de population".
 */
function normalizeWords(value: string): string {
  return normalizeName(value)
    .replace(/\(s\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 1 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

/**
 * Workbook ↔ MekDyude semantic aliases. The workbook uses abstract worker
 * terms ("Mains-d'œuvre") where MekDyude's calculator expects the canonical
 * worker card (Paysan, with substitutes expanding to Forestier/Marin/etc.).
 * Keyed by `normalizeWords(nameFr)` — match after the same normalization.
 */
const SEMANTIC_ALIASES: Record<string, string> = {
  "main d'oeuvre": "Paysan",
  "main d oeuvre": "Paysan",
};

function buildCarteNameIndex(cartes: Carte[]): Map<string, Carte> {
  const index = new Map<string, Carte>();
  for (const c of cartes) {
    const key = normalizeWords(c.nameFr);
    if (!index.has(key)) index.set(key, c);
  }
  for (const [alias, target] of Object.entries(SEMANTIC_ALIASES)) {
    const targetCarte = [...index.values()].find(
      (c) => normalizeWords(c.nameFr) === normalizeWords(target)
    );
    if (targetCarte && !index.has(alias)) index.set(alias, targetCarte);
  }
  return index;
}

function lookupCarte(name: string, index: Map<string, Carte>): Carte | null {
  return index.get(normalizeWords(name)) ?? null;
}

function deriveInputs(b: Batiment, carteByName: Map<string, Carte>): BuildingInput[] {
  if (!b.capaciteType || b.capaciteQuantite === null) return [];
  const carte = lookupCarte(b.capaciteType, carteByName);
  if (!carte) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[engine] ${b.id}: capaciteType "${b.capaciteType}" doesn't resolve to a Carte; building has no inputs`
      );
    }
    return [];
  }
  return [
    {
      card_id: carte.id,
      card_title: carte.nameFr,
      max_quantity: b.capaciteQuantite,
    },
  ];
}

function deriveOutputs(
  b: Batiment,
  allEffets: Effet[],
  carteByName: Map<string, Carte>
): BuildingOutput[] {
  const productionEffets = allEffets.filter(
    (e) =>
      e.sourceType === "Bâtiment" &&
      e.sourceId === b.id &&
      (e.typeEffet === "Production / capacité" || e.typeEffet === null)
  );

  const outputs: BuildingOutput[] = [];
  let order = 0;

  for (const effet of productionEffets) {
    const parsed = parseProductionText(effet.texte);
    if (parsed.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[engine] ${b.id}: couldn't parse Effet.texte "${effet.texte}" — workbook fidelity gap`
        );
      }
      continue;
    }
    for (const row of parsed) {
      const carte = lookupCarte(row.outputName, carteByName);
      if (!carte) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[engine] ${b.id}: output name "${row.outputName}" doesn't resolve to a Carte`
          );
        }
        continue;
      }
      outputs.push({
        card_id: carte.id,
        card_title: carte.nameFr,
        quantity_per_input: row.quantity,
        input_divisor: row.divisor,
        full_capacity_bonus: row.fullCapacityBonus,
        use_domain_mineral: false,
        display_order: order++,
        constraints: [],
      });
    }
  }

  return outputs;
}

function appendList<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

// =============================================================================
// Forward walk
// =============================================================================

export async function expandForward(
  rootCardId: string,
  options: TreeOptions = {}
): Promise<CardNode | null> {
  const repo = await Repo.load();
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
  ancestry: Set<string>,
  depth: number,
  opts: { maxDepth: number; includeSubstitutes: boolean }
): CardNode {
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
        : {
            kind: "card",
            card: {
              id: o.card_id,
              title: o.card_title,
              category: "?",
              substitutes: [],
              statut: "Extrait",
            },
            buildings: [],
            alreadyShown: false,
          };
      return { output: o, child };
    });
    return { building: b, matchedInputCardId: card.id, outputs };
  });

  return { kind: "card", card, buildings: buildingEntries, alreadyShown: false };
}

// =============================================================================
// Reverse walk
// =============================================================================

export async function expandReverse(
  targetCardId: string,
  neededQty: number,
  options: TreeOptions = {}
): Promise<ReverseNode | null> {
  const repo = await Repo.load();
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
  ancestry: Set<string>,
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
      const perInput = output.quantity_per_input / Math.max(1, output.input_divisor);
      const requiredInputUnits = perInput > 0 ? Math.ceil(neededQty / perInput) : 0;

      const inputs: ReverseInputEntry[] = b.inputs.map((i) => {
        const inCard = repo.getCard(i.card_id);
        if (!inCard) {
          return {
            input: i,
            child: {
              kind: "reverse",
              card: {
                id: i.card_id,
                title: i.card_title,
                category: "?",
                substitutes: [],
                statut: "Extrait",
              },
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
// Convenience helpers for API routes / pages
// =============================================================================

export async function listAllCards(): Promise<Card[]> {
  const repo = await Repo.load();
  return repo.listCards();
}

export async function getCardById(id: string): Promise<Card | null> {
  const repo = await Repo.load();
  return repo.getCard(id);
}

export async function getBuildingById(id: string): Promise<BuildingNode | null> {
  const repo = await Repo.load();
  return repo.getBuilding(id);
}

export async function loadRepo(): Promise<Repo> {
  return Repo.load();
}
