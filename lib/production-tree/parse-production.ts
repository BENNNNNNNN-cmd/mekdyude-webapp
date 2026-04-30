/**
 * Parses Phase 1's free-text Effet.texte into structured production rows.
 *
 * Phase 1's `Effet` table only stores prose like "5 céréales par main-d'œuvre
 * affectée" or "1 point de pouvoir par tranche de 5 fiches de population
 * affectées; une cathédrale à pleine capacité reçoit 1 point de pouvoir de
 * plus". MekDyude's calculator wants structured fields (quantity_per_input,
 * input_divisor, full_capacity_bonus). We derive them by regex.
 *
 * If a building's text doesn't match any pattern, the engine logs a warning
 * and surfaces the building with empty outputs — flag for workbook fixup
 * in MARCHE NATION CELTE.
 */

export interface ParsedProductionRow {
  /** Resource name (lowercased, accent-stripped via consumer) — e.g. "céréales", "point de pouvoir". */
  outputName: string;
  /** Base quantity produced per input unit (or per divisor's worth of input). */
  quantity: number;
  /** Divisor: outputs `quantity` per `divisor` input units. Default 1. */
  divisor: number;
  /** Bonus output when building is at full capacity. Default 0. */
  fullCapacityBonus: number;
}

const NUM_TOKEN = "(\\d+(?:[.,]\\d+)?)";

/** Matches "à pleine capacité reçoit N <resource> de plus" or similar. */
const FULL_CAP_RE =
  /[àa]\s+pleine\s+capacit[ée]\s+(?:re[çc]oit|produit|donne)\s+(\d+(?:[.,]\d+)?)\s+([^.;]+?)\s+(?:de\s+plus|en\s+plus|suppl[ée]mentaire)/i;

/** Matches "par tranche de N <input>" → divisor=N. */
const TRANCHE_RE = /par\s+tranche\s+de\s+(\d+)\s+/i;

/** Splits a multi-output stem like "7 V, 7 É et 3 A" into ["7 V", "7 É", "3 A"]. */
function splitOutputs(stem: string): string[] {
  return stem
    .split(/,\s*|\s+et\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse a single output token like "5 céréales" or "1 point de pouvoir".
 * Returns null if it doesn't start with a number.
 */
function parseOutputToken(token: string): { quantity: number; outputName: string } | null {
  const m = token.match(new RegExp(`^${NUM_TOKEN}\\s+(.+)$`));
  if (!m) return null;
  const quantity = Number(m[1].replace(",", "."));
  if (!Number.isFinite(quantity)) return null;
  const outputName = m[2].trim();
  return { quantity, outputName };
}

/**
 * Strip leading filler like "Un maximum de" or "Maximum de".
 */
function stripFiller(text: string): string {
  return text.replace(/^un\s+maximum\s+de\s+/i, "").replace(/^maximum\s+de\s+/i, "");
}

/**
 * Parse a production-effect text into N structured rows.
 *
 * Returns [] if no pattern matched — caller should log + surface as a fidelity gap.
 */
export function parseProductionText(texte: string): ParsedProductionRow[] {
  const trimmed = texte.trim();
  if (!trimmed) return [];

  const semiSplit = trimmed.split(/;\s*/);
  const main = stripFiller(semiSplit[0]);
  const tail = semiSplit.slice(1).join("; ");

  // Extract full-capacity bonus from the tail (or from main if it's all one sentence).
  let fullCapacityBonus = 0;
  let fullCapacityResource: string | null = null;
  const capMatch = (tail || main).match(FULL_CAP_RE);
  if (capMatch) {
    fullCapacityBonus = Number(capMatch[1].replace(",", "."));
    fullCapacityResource = capMatch[2].trim();
  }

  // Extract divisor from the "par tranche de N" pattern.
  const divisorMatch = main.match(TRANCHE_RE);
  const divisor = divisorMatch ? Number(divisorMatch[1]) : 1;

  // Identify the output stem: everything before the first "par" (which may be
  // "par tranche de N" or "par <input>" or "par <input> affecté").
  const parIndex = main.search(/\spar\s/i);
  const outputStem = parIndex >= 0 ? main.slice(0, parIndex) : main;

  const tokens = splitOutputs(outputStem);
  const rows: ParsedProductionRow[] = [];

  for (const token of tokens) {
    const parsed = parseOutputToken(token);
    if (!parsed) continue;
    const isBonusOutput =
      fullCapacityResource !== null &&
      parsed.outputName.toLowerCase().startsWith(fullCapacityResource.toLowerCase().slice(0, 5));
    rows.push({
      outputName: parsed.outputName,
      quantity: parsed.quantity,
      divisor,
      fullCapacityBonus: isBonusOutput ? fullCapacityBonus : 0,
    });
  }

  // If the bonus references an output we didn't see in the stem, append it
  // as its own row with quantity=0 (calculator treats it as a pure bonus).
  if (
    fullCapacityResource &&
    !rows.some((r) =>
      r.outputName
        .toLowerCase()
        .startsWith(fullCapacityResource!.toLowerCase().slice(0, 5))
    )
  ) {
    rows.push({
      outputName: fullCapacityResource,
      quantity: 0,
      divisor: 1,
      fullCapacityBonus,
    });
  }

  return rows;
}
