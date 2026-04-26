/**
 * Phase 0 verification script.
 *
 * What this does:
 *   1. Backs up bicolline.db → bicolline.db.pre-bicolline-backup (once).
 *   2. Applies schema deltas + bicolline seed (same code path as the dev server).
 *   3. Re-runs the seed to prove idempotency — counts must be identical.
 *   4. Spot-checks: Abbaye outputs, Château constraint, full-capacity bonuses,
 *      16 imported buildings, Paysan substitutes, no orphan domain_buildings.
 *   5. Exits 0 on success, non-zero on any failure.
 *
 * Run:  npm run verify:seed
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { seedBicollineData } from "../db/seed-bicolline";

const DB_PATH = path.join(process.cwd(), "bicolline.db");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");
const BACKUP_PATH = DB_PATH + ".pre-bicolline-backup";

function backup() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`✗ ${DB_PATH} does not exist. Start the dev server at least once first to create the DB.`);
    process.exit(1);
  }
  if (fs.existsSync(BACKUP_PATH)) {
    console.log(`• Backup already exists: ${BACKUP_PATH} (keeping it as-is)`);
    return;
  }
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✓ Backed up DB to ${BACKUP_PATH}`);
}

function applySchema(db: Database.Database) {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);
}

function snapshot(label: string) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const counts = {
      cards: (db.prepare("SELECT COUNT(*) c FROM cards").get() as { c: number }).c,
      card_substitutes: (db.prepare("SELECT COUNT(*) c FROM card_substitutes").get() as { c: number }).c,
      building_templates: (db.prepare("SELECT COUNT(*) c FROM building_templates").get() as { c: number }).c,
      building_inputs: (db.prepare("SELECT COUNT(*) c FROM building_inputs").get() as { c: number }).c,
      building_outputs: (db.prepare("SELECT COUNT(*) c FROM building_outputs").get() as { c: number }).c,
      building_output_constraints: (db
        .prepare("SELECT COUNT(*) c FROM building_output_constraints")
        .get() as { c: number }).c,
      with_bicolline_id: (db
        .prepare("SELECT COUNT(*) c FROM building_templates WHERE bicolline_id IS NOT NULL")
        .get() as { c: number }).c,
      domain_buildings: (db.prepare("SELECT COUNT(*) c FROM domain_buildings").get() as { c: number }).c,
    };
    console.log(`\n[${label}] counts:`);
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(28)} ${v}`);
    return counts;
  } finally {
    db.close();
  }
}

function spotChecks() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    console.log("\n--- Abbaye outputs (must be 3: Victuailles 7, Équipement 7, Armement 3) ---");
    const abbaye = db
      .prepare(
        `SELECT c.title, bo.quantity_per_input, bo.full_capacity_bonus
         FROM building_outputs bo
         JOIN cards c ON c.id = bo.output_card_id
         JOIN building_templates bt ON bt.id = bo.building_id
         WHERE bt.name = 'Abbaye' ORDER BY bo.display_order`
      )
      .all();
    console.table(abbaye);
    if (abbaye.length !== 3) throw new Error(`Abbaye should have 3 outputs, got ${abbaye.length}`);

    console.log("\n--- Château constraint (must be: Paysan capped by Fiche pop. 1/2 at fief scope) ---");
    const chat = db
      .prepare(
        `SELECT bt.name, c1.title AS output, c2.title AS constraining,
                boc.scope, boc.numerator, boc.denominator
         FROM building_output_constraints boc
         JOIN building_templates bt ON bt.id = boc.building_id
         JOIN cards c1 ON c1.id = boc.output_card_id
         JOIN cards c2 ON c2.id = boc.constraining_card_id`
      )
      .all();
    console.table(chat);
    if (chat.length !== 1) throw new Error(`Should be exactly 1 constraint, got ${chat.length}`);

    console.log("\n--- Full-capacity bonuses (must be 10 buildings) ---");
    const fcb = db
      .prepare(
        `SELECT bt.name, c.title AS output, bo.full_capacity_bonus
         FROM building_outputs bo
         JOIN building_templates bt ON bt.id = bo.building_id
         JOIN cards c ON c.id = bo.output_card_id
         WHERE bo.full_capacity_bonus > 0
         ORDER BY bt.name`
      )
      .all();
    console.table(fcb);
    if (fcb.length !== 10) throw new Error(`Expected 10 full-capacity bonuses, got ${fcb.length}`);

    console.log("\n--- Newly inserted buildings (should be 16, all flagged 'Importé...') ---");
    const newOnes = db
      .prepare(
        `SELECT id, name, sphere FROM building_templates
         WHERE notes LIKE 'Importé%' ORDER BY name`
      )
      .all();
    console.table(newOnes);
    if (newOnes.length !== 16) throw new Error(`Expected 16 imported buildings, got ${newOnes.length}`);

    console.log("\n--- Substitute groups (Paysan must have 7 substitutes) ---");
    const subs = db
      .prepare(
        `SELECT c.title AS card, c2.title AS substitute
         FROM card_substitutes cs
         JOIN cards c ON c.id = cs.card_id
         JOIN cards c2 ON c2.id = cs.substitute_card_id
         WHERE c.title = 'Paysan'`
      )
      .all();
    console.table(subs);
    if (subs.length !== 7) throw new Error(`Paysan should have 7 substitutes, got ${subs.length}`);

    console.log("\n--- Existing domain_buildings still resolve to a building_template ---");
    const orphans = db
      .prepare(
        `SELECT db.id FROM domain_buildings db
         LEFT JOIN building_templates bt ON bt.id = db.building_template_id
         WHERE bt.id IS NULL`
      )
      .all();
    if (orphans.length > 0) {
      console.error(orphans);
      throw new Error(`${orphans.length} domain_buildings rows orphaned!`);
    }
    console.log("  ✓ No orphans.");
  } finally {
    db.close();
  }
}

function runSeed(label: string) {
  console.log(`\n→ ${label}`);
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  applySchema(db);
  seedBicollineData(db);
  db.close();
}

function main() {
  console.log("=== Phase 0 verification ===\n");
  backup();

  runSeed("First seed run (apply schema + seed bicolline data)");
  const counts1 = snapshot("after run 1");

  runSeed("Second seed run (idempotency check)");
  const counts2 = snapshot("after run 2");

  let drift = false;
  for (const k of Object.keys(counts1) as Array<keyof typeof counts1>) {
    if (counts1[k] !== counts2[k]) {
      console.error(`✗ Idempotency violated: ${k} ${counts1[k]} → ${counts2[k]}`);
      drift = true;
    }
  }
  if (drift) {
    console.error(`\nRestore your DB with:\n  cp "${BACKUP_PATH}" "${DB_PATH}"`);
    process.exit(1);
  }
  console.log("\n✓ Idempotent: counts identical between runs.");

  spotChecks();

  console.log("\n=== ✓ ALL CHECKS PASSED ===");
  console.log(`Backup of pre-migration DB lives at:\n  ${BACKUP_PATH}`);
  console.log(`If anything looks wrong later, restore with:\n  cp "${BACKUP_PATH}" "${DB_PATH}"`);
}

try {
  main();
} catch (e) {
  console.error("\n✗ VERIFICATION FAILED:");
  console.error(e);
  console.error(`\nRestore your DB with:\n  cp "${BACKUP_PATH}" "${DB_PATH}"`);
  process.exit(1);
}
