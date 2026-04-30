/**
 * Production-tree domain types.
 *
 * Phase 2 ID universe (post-migration to shared Postgres):
 *   - card.id      — Postgres Carte.id, e.g. CARTE_PAYSAN
 *   - building.id  — Postgres Batiment.id, e.g. BAT_CHATEAU
 *
 * `category` carries the Carte.famille string from Postgres
 * (Unité, Lot de production, Richesse, Main-d'œuvre, Maître,
 *  Influence, Énergie, Bâtiment, Navire, Amélioration, Objet
 *  magique, Sort, Consommable, ...). Display-side mapping lives
 * with the consumer.
 */

export interface Card {
  id: string;
  title: string;
  category: string;
  /** ids of substitute cards (e.g. Paysan ↔ Forestier ↔ Marin ↔ ...) */
  substitutes: string[];
  /** Phase 1 statut: Confirmé | Extrait | À valider | Historique */
  statut: string;
}

export interface OutputConstraint {
  constraining_card_id: string;
  constraining_card_title: string;
  scope: "domain" | "fief" | "province" | "region";
  numerator: number;
  denominator: number;
}

export interface BuildingOutput {
  card_id: string;
  card_title: string;
  quantity_per_input: number;
  input_divisor: number;
  full_capacity_bonus: number;
  use_domain_mineral: boolean;
  display_order: number;
  constraints: OutputConstraint[];
}

export interface BuildingInput {
  card_id: string;
  card_title: string;
  max_quantity: number;
}

/** Building denormalized for graph traversal. */
export interface BuildingNode {
  /** Postgres Batiment.id (BAT_*) */
  id: string;
  name: string;
  sphere: string;
  inputs: BuildingInput[];
  outputs: BuildingOutput[];
  /** Phase 1 statut: Confirmé | Extrait | À valider | Historique */
  statut: string;
}

/** A node in the forward production tree (card → buildings → outputs → recurse). */
export type TreeNode = CardNode;

export interface CardNode {
  kind: "card";
  card: Card;
  /** buildings that consume this card as input */
  buildings: BuildingTreeEntry[];
  /**
   * If this card already appeared higher in the same branch, it's marked
   * "déjà affiché" and `buildings` will be empty (cycle guard).
   */
  alreadyShown: boolean;
}

export interface BuildingTreeEntry {
  building: BuildingNode;
  /**
   * The single input card that triggered this entry being shown
   * (the parent CardNode's card.id).
   */
  matchedInputCardId: string;
  /** Recursive expansion: each output becomes a CardNode child. */
  outputs: OutputTreeEntry[];
  /**
   * Live-state overlay (Phase 2). Present only when the engine was called
   * with overlay=true. Null/undefined means generic-rules view.
   */
  overlay?: BuildingOverlay;
}

export interface BuildingOverlay {
  /** Global status across the guild's domains. */
  status: "built" | "buildable" | "blocked";
  /** Domains where this building is already constructed. */
  builtOn: BuiltInstance[];
  /** Domains where it could be constructed (any of these passing → buildable). */
  buildableOn: DomainCandidate[];
  /** Domains where it's blocked, with reasons. */
  blockedOn: DomainCandidate[];
  /** One-line summary suitable for a tooltip. */
  summary: string;
}

export interface BuiltInstance {
  domain_id: string;
  domain_name: string;
  assigned_count: number;
  capacity: number;
}

export interface DomainCandidate {
  domain_id: string;
  domain_name: string;
  reasons: string[];
}

export interface OutputTreeEntry {
  output: BuildingOutput;
  /** Recursive: this output card seeds the next CardNode. */
  child: CardNode;
}

/** Reverse-walk node (target card → buildings producing it → their inputs → recurse). */
export interface ReverseNode {
  kind: "reverse";
  card: Card;
  needed_qty: number;
  /** buildings that produce this card */
  producers: ReverseProducerEntry[];
  alreadyShown: boolean;
}

export interface ReverseProducerEntry {
  building: BuildingNode;
  output: BuildingOutput;
  /** how many of this building's input units are needed to hit needed_qty */
  required_input_units: number;
  /** for each input (with substitutes), the recursive demand */
  inputs: ReverseInputEntry[];
}

export interface ReverseInputEntry {
  input: BuildingInput;
  child: ReverseNode;
}

export interface TreeOptions {
  /** Maximum depth — protects against runaway expansion. Default 6. */
  maxDepth?: number;
  /** Include substitute cards as input matches. Default false. */
  includeSubstitutes?: boolean;
}
