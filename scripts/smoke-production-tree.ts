/**
 * Smoke test for the production-tree engine.
 * Runs the engine directly against the DB and prints sample trees so you can
 * eyeball the math before launching the dev server.
 *
 * Run:  npm run smoke:tree
 */

import path from "path";
import Database from "better-sqlite3";
import { listAllCards, expandForward, expandReverse, getCardById } from "../lib/production-tree/engine";
import type { CardNode, BuildingTreeEntry, ReverseNode } from "../lib/production-tree/types";

const DB_PATH = path.join(process.cwd(), "bicolline.db");

function indent(depth: number) {
  return "  ".repeat(depth);
}

function renderForward(node: CardNode, depth = 0, max = 3) {
  const tag = node.alreadyShown ? " [déjà affiché]" : "";
  console.log(`${indent(depth)}📇 ${node.card.title}${tag}`);
  if (depth >= max) return;
  for (const b of node.buildings) {
    renderBuildingEntry(b, depth + 1, max);
  }
}

function renderBuildingEntry(b: BuildingTreeEntry, depth: number, max: number) {
  const inputCard = b.building.inputs.find((i) => i.card_id === b.matchedInputCardId);
  const cap = inputCard ? ` (cap ${inputCard.max_quantity})` : "";
  console.log(`${indent(depth)}🏛  ${b.building.name}${cap}`);
  for (const o of b.outputs) {
    const ratio = `${o.output.input_divisor}→${o.output.quantity_per_input}`;
    const bonus = o.output.full_capacity_bonus > 0 ? ` +${o.output.full_capacity_bonus} pleine cap.` : "";
    const constraints = o.output.constraints
      .map((c) => ` ⚠ ≤${c.numerator}/${c.denominator} ${c.constraining_card_title}/${c.scope}`)
      .join("");
    console.log(`${indent(depth + 1)}↳ ${o.output.card_title} (${ratio})${bonus}${constraints}`);
    if (depth + 2 <= max && !o.child.alreadyShown && o.child.buildings.length > 0) {
      renderForward(o.child, depth + 2, max);
    } else if (o.child.alreadyShown) {
      console.log(`${indent(depth + 2)}📇 ${o.child.card.title} [déjà affiché]`);
    }
  }
}

function renderReverse(node: ReverseNode, depth = 0, max = 3) {
  const tag = node.alreadyShown ? " [déjà affiché]" : "";
  console.log(`${indent(depth)}🎯 ${node.card.title} (besoin ${node.needed_qty})${tag}`);
  if (depth >= max || node.alreadyShown) return;
  for (const p of node.producers) {
    console.log(
      `${indent(depth + 1)}🏛  ${p.building.name} produit ${p.output.quantity_per_input}/intrant — requiert ${p.required_input_units} intrants`
    );
    for (const i of p.inputs) {
      console.log(`${indent(depth + 2)}↳ Input: ${i.input.card_title}`);
      if (depth + 3 <= max) renderReverse(i.child, depth + 3, max);
    }
  }
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  console.log(`=== ${listAllCards(db).length} cards loaded\n`);

  // 1. Forward tree from "Paysan" (id 36)
  console.log("─".repeat(60));
  console.log("FORWARD TREE: Paysan (max depth 2)");
  console.log("─".repeat(60));
  const paysan = expandForward(db, 36, { maxDepth: 2 });
  if (paysan) renderForward(paysan, 0, 3);
  else console.log("Paysan not found");

  // 2. Forward tree from "Croyant" (id 44) — Abbaye special case
  console.log("\n" + "─".repeat(60));
  console.log("FORWARD TREE: Croyant (must show Abbaye 7V/7É/3A)");
  console.log("─".repeat(60));
  const croyant = expandForward(db, 44, { maxDepth: 1 });
  if (croyant) renderForward(croyant, 0, 2);

  // 3. Forward tree from "Intendant" — Château with constraint
  console.log("\n" + "─".repeat(60));
  console.log("FORWARD TREE: Intendant (must show Château + constraint)");
  console.log("─".repeat(60));
  const intendant = expandForward(db, 47, { maxDepth: 1 });
  if (intendant) renderForward(intendant, 0, 2);

  // 4. Reverse: 50 Équipement
  console.log("\n" + "─".repeat(60));
  console.log("REVERSE TREE: 50 Équipement (Phase 3 preview)");
  console.log("─".repeat(60));
  const equipement = getCardById(db, 54);
  if (equipement) {
    const rev = expandReverse(db, 54, 50, { maxDepth: 2 });
    if (rev) renderReverse(rev, 0, 4);
  }

  // 5. Loop guard: Faubourg → Paysan → Faubourg
  console.log("\n" + "─".repeat(60));
  console.log("CYCLE GUARD: starting from Fiche pop. (id 5) — Faubourg→Paysan→Faubourg loop should mark 'déjà affiché'");
  console.log("─".repeat(60));
  const fp = expandForward(db, 5, { maxDepth: 4 });
  if (fp) renderForward(fp, 0, 5);

  db.close();
  console.log("\n=== ✓ smoke test complete ===");
}

try {
  main();
} catch (e) {
  console.error("✗ smoke failed:", e);
  process.exit(1);
}
