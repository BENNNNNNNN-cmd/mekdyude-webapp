/**
 * Production-tree domain types.
 *
 * Bicolline ID universe:
 *   - card.id           — bicolline numeric id (1, 36, 44, ...)
 *   - building.bicolline_id — bicolline numeric id (1, 22, 30, ...)
 *   - building_templates.id — your local slug ("abbaye", "champs", ...)
 *
 * Card categories (from bicolline taxonomy):
 *   "1"  Population
 *   "2"  Influences (Andore, Empire, etc.)
 *   "3"  Special / Magic / Devices
 *   "4"  Workers (Paysan, Forestier, Marin, ...) — substitutes apply here
 *   "5"  Mentors / Specialists (Charpentier, Croyant, Intendant, ...)
 *   "6"  Resources (Armement, Bétail, Céréales, Équipement, Ressource, ...)
 *   "7"  Military / Combat units
 *   "8"  Archers
 *   "10" Wealth / Cargo / Art
 */

export type CardCategory =
  | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "10";

export interface Card {
  id: number;
  title: string;
  category: CardCategory | string;
  /** ids of substitute cards (e.g. Paysan ↔ Forestier ↔ Marin ↔ ...) */
  substitutes: number[];
}

export interface OutputConstraint {
  constraining_card_id: number;
  constraining_card_title: string;
  scope: "domain" | "fief" | "province" | "region";
  numerator: number;
  denominator: number;
}

export interface BuildingOutput {
  card_id: number;
  card_title: string;
  quantity_per_input: number;
  input_divisor: number;
  full_capacity_bonus: number;
  use_domain_mineral: boolean;
  display_order: number;
  constraints: OutputConstraint[];
}

export interface BuildingInput {
  card_id: number;
  card_title: string;
  max_quantity: number;
}

/** Building denormalized for graph traversal. */
export interface BuildingNode {
  /** local slug — primary key in building_templates */
  id: string;
  name: string;
  sphere: string;
  bicolline_id: number | null;
  inputs: BuildingInput[];
  outputs: BuildingOutput[];
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
  matchedInputCardId: number;
  /** Recursive expansion: each output becomes a CardNode child. */
  outputs: OutputTreeEntry[];
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
