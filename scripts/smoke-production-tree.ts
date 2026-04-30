/**
 * Smoke test for the production-tree engine.
 * Runs the engine directly against shared Postgres reference data and prints
 * sample trees so you can eyeball the math before launching the dev server.
 *
 * Run:  npm run smoke:tree
 */

import "dotenv/config";
import {
  expandForward,
  expandReverse,
  getCardById,
  listAllCards,
} from "../lib/production-tree/engine";
import { annotateForward } from "../lib/production-tree/overlay";
import type { CardNode, BuildingTreeEntry, ReverseNode } from "../lib/production-tree/types";

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
  const overlay = b.overlay
    ? `  [${
        b.overlay.status === "built" ? "✓" : b.overlay.status === "buildable" ? "⚠" : "✗"
      } ${b.overlay.summary}]`
    : "";
  const statut = b.building.statut !== "Confirmé" ? ` ⓘ ${b.building.statut}` : "";
  console.log(`${indent(depth)}🏛  ${b.building.name}${cap}${statut}${overlay}`);
  for (const o of b.outputs) {
    const ratio = `${o.output.input_divisor}→${o.output.quantity_per_input}`;
    const bonus =
      o.output.full_capacity_bonus > 0 ? ` +${o.output.full_capacity_bonus} pleine cap.` : "";
    console.log(`${indent(depth + 1)}↳ ${o.output.card_title} (${ratio})${bonus}`);
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

async function main() {
  const cards = await listAllCards();
  console.log(`=== ${cards.length} cards loaded from Postgres\n`);

  // 1. Forward tree from Paysan
  console.log("─".repeat(60));
  console.log("FORWARD TREE: Paysan (max depth 2)");
  console.log("─".repeat(60));
  const paysan = await expandForward("CARTE_PAYSAN", { maxDepth: 2 });
  if (paysan) renderForward(paysan, 0, 3);
  else console.log("CARTE_PAYSAN not found");

  // 2. Forward tree from Croyant — Abbaye multi-output
  console.log("\n" + "─".repeat(60));
  console.log("FORWARD TREE: Croyant (must show Abbaye 7V/7É/3A as 3 outputs)");
  console.log("─".repeat(60));
  const croyant = await expandForward("CARTE_CROYANT", { maxDepth: 1 });
  if (croyant) renderForward(croyant, 0, 2);

  // 3. Forward tree from Intendant — Château with constraint
  console.log("\n" + "─".repeat(60));
  console.log("FORWARD TREE: Intendant (must show Château)");
  console.log("─".repeat(60));
  const intendant = await expandForward("CARTE_INTENDANT", { maxDepth: 1 });
  if (intendant) renderForward(intendant, 0, 2);

  // 4. Reverse: 50 Équipement
  console.log("\n" + "─".repeat(60));
  console.log("REVERSE TREE: 50 Équipement");
  console.log("─".repeat(60));
  const equipement = await getCardById("CARTE_EQUIPEMENT");
  if (equipement) {
    const rev = await expandReverse("CARTE_EQUIPEMENT", 50, { maxDepth: 2 });
    if (rev) renderReverse(rev, 0, 4);
  } else {
    console.log("CARTE_EQUIPEMENT not found");
  }

  // 5. Cycle guard from Fiche de population
  console.log("\n" + "─".repeat(60));
  console.log("CYCLE GUARD: Fiche de population (loops should mark 'déjà affiché')");
  console.log("─".repeat(60));
  const fp = await expandForward("CARTE_FICHE_DE_POPULATION", { maxDepth: 4 });
  if (fp) renderForward(fp, 0, 5);

  // 6. Overlay: Paysan tree with Mek Dyude state
  console.log("\n" + "─".repeat(60));
  console.log("OVERLAY: Paysan tree with Mek Dyude built/buildable/blocked");
  console.log("─".repeat(60));
  const paysanWithOverlay = await expandForward("CARTE_PAYSAN", { maxDepth: 1 });
  if (paysanWithOverlay) {
    await annotateForward(paysanWithOverlay, "mek_dyude");
    renderForward(paysanWithOverlay, 0, 2);
  }

  console.log("\n=== ✓ smoke test complete ===");
}

main().catch((err) => {
  console.error("✗ smoke failed:", err);
  process.exit(1);
});
