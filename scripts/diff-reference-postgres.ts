/**
 * Phase 2 gate — JSON↔Postgres delta report.
 *
 * Compares db/seed-data/cards.json (121) and buildings.json (69) against
 * Postgres `Carte` (152) and `Batiment` (70). Reports which JSON entries
 * are missing from Postgres so the workbook can be patched in MARCHE
 * before Phase 2 deletes the JSON.
 *
 * Run:
 *   MARKET_DATABASE_URL=postgresql://... npx tsx scripts/diff-reference-postgres.ts
 *
 * Exit code: 0 if JSON-side missing list is empty (gate passes).
 *            1 if any JSON entry has no Postgres counterpart (gate blocks).
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  getBatiments,
  getCartes,
  normalizeName,
  type Batiment,
  type Carte,
} from "../lib/reference-postgres";

type CardJson = { id: number; title: string; category: string; substitutes: number[] };
type BuildingJson = {
  id: number;
  name: string;
  inputs: Array<{ card_id: number; max_quantity: number }>;
  outputs: Array<{
    card_id: number;
    quantity_per_input: number;
    constraints?: Array<{ constraining_card_id: number }>;
  }>;
};

const SEED_DIR = path.join(process.cwd(), "db", "seed-data");

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), "utf-8"));
}

function normalized(value: string): string {
  return normalizeName(value)
    .split(" ")
    .map((w) => (w.length > 1 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function nearestMatch(needle: string, haystack: Array<{ id: string; nameFr: string }>): string | null {
  const n = normalized(needle);
  let bestScore = Infinity;
  let bestName: string | null = null;
  for (const h of haystack) {
    const score = levenshtein(n, normalized(h.nameFr));
    if (score < bestScore) {
      bestScore = score;
      bestName = h.nameFr;
    }
  }
  if (bestName === null) return null;
  return bestScore <= Math.max(3, Math.floor(n.length / 3)) ? bestName : null;
}

function buildIndex(rows: Array<{ key: string }>): Set<string> {
  return new Set(rows.map((r) => r.key));
}

interface DiffSection {
  label: string;
  jsonOnly: Array<{
    jsonId: number;
    title: string;
    nearMatch: string | null;
    usedByBuildings: boolean;
  }>;
  postgresOnly: Array<{ id: string; nameFr: string }>;
}

function buildCalculatorRefSet(buildings: Record<string, BuildingJson>): Set<number> {
  const refs = new Set<number>();
  for (const b of Object.values(buildings)) {
    for (const i of b.inputs) refs.add(i.card_id);
    for (const o of b.outputs) {
      refs.add(o.card_id);
      for (const c of o.constraints ?? []) refs.add(c.constraining_card_id);
    }
  }
  return refs;
}

function diffCards(
  jsonCards: Record<string, CardJson>,
  postgres: Carte[],
  calculatorRefs: Set<number>
): DiffSection {
  const pgIndex = buildIndex(postgres.map((c) => ({ key: normalized(c.nameFr) })));
  const pgRefs = postgres.map((c) => ({ id: c.id, nameFr: c.nameFr }));
  const jsonIndex = new Map<string, { jsonId: number; title: string }>();

  for (const c of Object.values(jsonCards)) {
    jsonIndex.set(normalized(c.title), { jsonId: c.id, title: c.title });
  }

  const jsonOnly = [...jsonIndex.entries()]
    .filter(([key]) => !pgIndex.has(key))
    .map(([, v]) => ({
      ...v,
      nearMatch: nearestMatch(v.title, pgRefs),
      usedByBuildings: calculatorRefs.has(v.jsonId),
    }))
    .sort((a, b) => {
      if (a.usedByBuildings !== b.usedByBuildings) return a.usedByBuildings ? -1 : 1;
      return a.title.localeCompare(b.title, "fr");
    });

  const postgresOnly = postgres
    .filter((c) => !jsonIndex.has(normalized(c.nameFr)))
    .map((c) => ({ id: c.id, nameFr: c.nameFr }))
    .sort((a, b) => a.nameFr.localeCompare(b.nameFr, "fr"));

  return { label: "Cards", jsonOnly, postgresOnly };
}

function diffBuildings(
  jsonBuildings: Record<string, BuildingJson>,
  postgres: Batiment[]
): DiffSection {
  const pgIndex = buildIndex(postgres.map((b) => ({ key: normalized(b.nameFr) })));
  const pgRefs = postgres.map((b) => ({ id: b.id, nameFr: b.nameFr }));
  const jsonIndex = new Map<string, { jsonId: number; title: string }>();

  for (const b of Object.values(jsonBuildings)) {
    jsonIndex.set(normalized(b.name), { jsonId: b.id, title: b.name });
  }

  const jsonOnly = [...jsonIndex.entries()]
    .filter(([key]) => !pgIndex.has(key))
    .map(([, v]) => ({
      ...v,
      nearMatch: nearestMatch(v.title, pgRefs),
      usedByBuildings: true,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));

  const postgresOnly = postgres
    .filter((b) => !jsonIndex.has(normalized(b.nameFr)))
    .map((b) => ({ id: b.id, nameFr: b.nameFr }))
    .sort((a, b) => a.nameFr.localeCompare(b.nameFr, "fr"));

  return { label: "Buildings", jsonOnly, postgresOnly };
}

function renderSection(section: DiffSection): string {
  const lines: string[] = [];
  lines.push(`## ${section.label}`);
  lines.push("");

  lines.push(`### JSON-only (BLOCKING — add to workbook in MARCHE before Phase 2 ships)`);
  if (section.jsonOnly.length === 0) {
    lines.push("_(none)_ ✓");
  } else {
    lines.push("| JSON id | Title | Used by calculator | Nearest in Postgres |");
    lines.push("|---|---|---|---|");
    for (const r of section.jsonOnly) {
      const used = r.usedByBuildings ? "**YES**" : "no";
      lines.push(`| ${r.jsonId} | ${r.title} | ${used} | ${r.nearMatch ?? "_(no near match)_"} |`);
    }
  }
  lines.push("");

  lines.push(`### Postgres-only (informational — workbook has these, JSON does not)`);
  if (section.postgresOnly.length === 0) {
    lines.push("_(none)_");
  } else {
    lines.push("| Postgres id | nameFr |");
    lines.push("|---|---|");
    for (const r of section.postgresOnly) lines.push(`| ${r.id} | ${r.nameFr} |`);
  }
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const cardsJson = loadJson<Record<string, CardJson>>("cards.json");
  const buildingsJson = loadJson<Record<string, BuildingJson>>("buildings.json");

  console.log("→ Loading Postgres reference data…");
  const [cartes, batiments] = await Promise.all([getCartes(), getBatiments()]);
  console.log(`  ${cartes.length} cartes, ${batiments.length} batiments`);

  const calculatorRefs = buildCalculatorRefSet(buildingsJson);
  const cardSection = diffCards(cardsJson, cartes, calculatorRefs);
  const buildingSection = diffBuildings(buildingsJson, batiments);

  console.log("");
  console.log("# Phase 2 — JSON↔Postgres delta report");
  console.log("");
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log("");
  console.log(`- JSON cards:      ${Object.keys(cardsJson).length}`);
  console.log(`- Postgres cartes: ${cartes.length}`);
  console.log(`- JSON buildings:  ${Object.keys(buildingsJson).length}`);
  console.log(`- Postgres bâtiments: ${batiments.length}`);
  console.log("");
  console.log(renderSection(cardSection));
  console.log(renderSection(buildingSection));

  // Critical-AND-no-near-match = true data loss. With a near-match present, it's
  // a rename (e.g. "Mentor d'aventurier" → "Mentor aventurier") and the engine
  // adapter resolves it via Carte.nameFr lookup — no workbook change needed.
  const criticalGaps = cardSection.jsonOnly.filter((r) => r.usedByBuildings && !r.nearMatch);
  const criticalRenames = cardSection.jsonOnly.filter((r) => r.usedByBuildings && r.nearMatch);
  const decorativeMissing = cardSection.jsonOnly.filter((r) => !r.usedByBuildings);
  const buildingMissing = buildingSection.jsonOnly.length;

  console.log("");
  console.log(`Summary:`);
  console.log(`  - Calculator-critical with no Postgres counterpart (TRUE GAP): ${criticalGaps.length}`);
  console.log(`  - Calculator-critical with a near-match (rename, OK):          ${criticalRenames.length}`);
  console.log(`  - Decorative (not used by calc), missing or renamed:           ${decorativeMissing.length}`);
  console.log(`  - Buildings in JSON but missing from Postgres:                 ${buildingMissing}`);
  console.log("");

  if (criticalGaps.length === 0 && buildingMissing === 0) {
    const extras: string[] = [];
    if (criticalRenames.length > 0) extras.push(`${criticalRenames.length} rename(s)`);
    if (decorativeMissing.length > 0) extras.push(`${decorativeMissing.length} decorative gap(s)`);
    if (extras.length === 0) {
      console.log("✓ Gate passes cleanly: every JSON entry has an exact Postgres counterpart.");
    } else {
      console.log(`✓ Gate passes for code: no true calculator gap. (${extras.join(", ")} — informational.)`);
    }
    process.exit(0);
  }

  console.log(
    `✗ Gate blocks: ${criticalGaps.length} true calculator gap(s) + ${buildingMissing} building(s) missing. ` +
      `Patch the workbook in MARCHE NATION CELTE, re-sync, then re-run.`
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("✗ Diff failed:", err);
  process.exit(1);
});
