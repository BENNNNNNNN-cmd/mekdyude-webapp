/**
 * Bicolline.online production-tree dataset seed.
 *
 * Sources (db/seed-data/):
 *   - cards.json                       (121 cards)
 *   - buildings.json                   ( 69 buildings — superset of your 53)
 *   - buildings_by_input_card.json     (reverse index, informational)
 *
 * What this does, in order:
 *   1. Add bicolline_id, input_divisor, full_capacity_bonus, use_domain_mineral
 *      columns to building_templates (idempotent).
 *   2. Upsert all 121 cards.
 *   3. Upsert card_substitutes (Esclave / Forestier / Marin / Nomade / Paysan /
 *      Peau verte / Voelhoorn / Homme-bête are interchangeable as worker inputs).
 *   4. Bridge bicolline buildings to your building_templates by exact name.
 *      For the 16 bicolline buildings you don't have yet, INSERT them with
 *      slugified IDs. Existing rows: backfill bicolline_id only — never
 *      overwrite your sphere/notes/structure_points.
 *   5. Replace building_inputs / building_outputs / building_output_constraints
 *      from bicolline data (these tables are pure derivations of the rulebook,
 *      safe to wipe-and-reload).
 *
 * Run as: imported by db/index.ts during getDb() initialization (idempotent).
 */

import type Database from "better-sqlite3";
import fs from "fs";
import path from "path";

type CardJson = {
  id: number;
  title: string;
  category: string;
  substitutes: number[];
};

type OutputJson = {
  card_id: number;
  quantity_per_input: number;
  input_divisor: number;
  full_capacity_bonus: number;
  use_domain_mineral: boolean;
  constraints: Array<{
    constraining_card_id: number;
    scope: "domain" | "fief" | "province" | "region";
    scope_display: string;
    numerator: number;
    denominator: number;
  }>;
};

type InputJson = {
  card_id: number;
  max_quantity: number;
};

type BuildingJson = {
  id: number;
  name: string;
  inputs: InputJson[];
  outputs: OutputJson[];
};

// Sphere classification for the 16 bicolline-only buildings (used when we
// INSERT them as new rows in building_templates). Best-effort from bicolline
// rulebook conventions; correct manually in the UI later if needed.
const NEW_BUILDING_SPHERES: Record<string, string> = {
  "Astrolabe de protection": "Magie",
  "Autel sacrificiel": "Croyance",
  "Brasserie": "Économique",
  "Cercle rituel": "Croyance",
  "Citadelle": "Militaire",
  "Comptoir commercial": "Économique",
  "Crypte": "Croyance",
  "Dolmen": "Croyance",
  "Glyphe de protection": "Magie",
  "Grand colisée": "Culture",
  "Laboratoire": "Magie",
  "Lieu ancestral": "Croyance",
  "Patenterie": "Magie",
  "Pentacle": "Croyance",
  "Réfectoire": "Croyance",
  "Tour de garde côtière": "Militaire",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function ensureBuildingTemplatesColumns(db: Database.Database) {
  const additions: Array<[string, string]> = [
    ["bicolline_id", "INTEGER"],
    ["input_divisor", "INTEGER NOT NULL DEFAULT 1"],
    ["full_capacity_bonus", "INTEGER NOT NULL DEFAULT 0"],
    ["use_domain_mineral", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [col, type] of additions) {
    if (!columnExists(db, "building_templates", col)) {
      db.exec(`ALTER TABLE building_templates ADD COLUMN ${col} ${type}`);
    }
  }
}

export function seedBicollineData(db: Database.Database) {
  const dataDir = path.join(process.cwd(), "db", "seed-data");
  const cards: Record<string, CardJson> = JSON.parse(
    fs.readFileSync(path.join(dataDir, "cards.json"), "utf-8")
  );
  const buildings: Record<string, BuildingJson> = JSON.parse(
    fs.readFileSync(path.join(dataDir, "buildings.json"), "utf-8")
  );

  ensureBuildingTemplatesColumns(db);

  const tx = db.transaction(() => {
    // --- 1. Cards ---------------------------------------------------------
    const upsertCard = db.prepare(`
      INSERT INTO cards (id, title, category)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category
    `);
    for (const c of Object.values(cards)) {
      upsertCard.run(c.id, c.title, c.category);
    }

    // --- 2. Substitutes (rebuild from scratch — pure derivation) ----------
    db.exec("DELETE FROM card_substitutes");
    const insertSub = db.prepare(
      "INSERT OR IGNORE INTO card_substitutes (card_id, substitute_card_id) VALUES (?, ?)"
    );
    for (const c of Object.values(cards)) {
      for (const sub of c.substitutes) {
        insertSub.run(c.id, sub);
      }
    }

    // --- 3. Bridge bicolline buildings to building_templates --------------
    // Build a name → existing slug map.
    const existingByName = new Map<string, string>();
    const existing = db
      .prepare("SELECT id, name FROM building_templates")
      .all() as Array<{ id: string; name: string }>;
    for (const r of existing) existingByName.set(r.name, r.id);

    const setBicollineId = db.prepare(
      "UPDATE building_templates SET bicolline_id = ?, input_divisor = ?, full_capacity_bonus = ?, use_domain_mineral = ? WHERE id = ?"
    );

    // For Phase 0, input_divisor / full_capacity_bonus / use_domain_mineral
    // on the building_templates row use the FIRST output's values (most buildings
    // have one output; multi-output buildings like Abbaye are fully described
    // in building_outputs rows below). The columns on building_templates are
    // a convenience denormalization for legacy code paths.
    const insertNewBuilding = db.prepare(`
      INSERT INTO building_templates (
        id, name, sphere, capacity, assignment_type, resource_produced,
        ratio_per_unit, domain_limitation, prerequisite_building,
        structure_points, notes, bicolline_id,
        input_divisor, full_capacity_bonus, use_domain_mineral
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const b of Object.values(buildings)) {
      const firstOutput = b.outputs[0];
      const firstInput = b.inputs[0];
      const inputDivisor = firstOutput?.input_divisor ?? 1;
      const fullCapBonus = firstOutput?.full_capacity_bonus ?? 0;
      const useDomainMineral = firstOutput?.use_domain_mineral ? 1 : 0;

      const existingId = existingByName.get(b.name);
      if (existingId) {
        setBicollineId.run(b.id, inputDivisor, fullCapBonus, useDomainMineral, existingId);
      } else {
        // New building from bicolline that you don't yet have. Insert with
        // slugified id, best-guess sphere, and minimal stats.
        const newId = slugify(b.name);
        const sphere = NEW_BUILDING_SPHERES[b.name] ?? "Autre";
        const capacity = firstInput?.max_quantity ?? 0;
        const assignmentType = firstInput
          ? cards[String(firstInput.card_id)]?.title ?? null
          : null;
        const resourceProduced = firstOutput
          ? cards[String(firstOutput.card_id)]?.title ?? null
          : null;
        const ratioPerUnit = firstOutput?.quantity_per_input ?? 0;

        insertNewBuilding.run(
          newId,
          b.name,
          sphere,
          capacity,
          assignmentType,
          resourceProduced,
          ratioPerUnit,
          null, // domain_limitation
          null, // prerequisite_building
          0,    // structure_points (unknown; fill later)
          "Importé depuis bicolline.online — détails complémentaires à compléter.",
          b.id,
          inputDivisor,
          fullCapBonus,
          useDomainMineral
        );
        existingByName.set(b.name, newId);
      }
    }

    // --- 4. building_inputs / building_outputs (rebuild from scratch) -----
    db.exec("DELETE FROM building_output_constraints");
    db.exec("DELETE FROM building_outputs");
    db.exec("DELETE FROM building_inputs");

    const insertInput = db.prepare(
      "INSERT INTO building_inputs (building_id, input_card_id, max_quantity) VALUES (?, ?, ?)"
    );
    const insertOutput = db.prepare(`
      INSERT INTO building_outputs (
        building_id, output_card_id, quantity_per_input,
        input_divisor, full_capacity_bonus, use_domain_mineral, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertConstraint = db.prepare(`
      INSERT INTO building_output_constraints (
        building_id, output_card_id, constraining_card_id,
        scope, numerator, denominator
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const b of Object.values(buildings)) {
      const slug = existingByName.get(b.name);
      if (!slug) {
        // Should never happen — we just inserted/mapped them all.
        throw new Error(`No slug for bicolline building "${b.name}"`);
      }

      for (const i of b.inputs) {
        insertInput.run(slug, i.card_id, i.max_quantity);
      }

      let order = 0;
      for (const o of b.outputs) {
        insertOutput.run(
          slug,
          o.card_id,
          o.quantity_per_input,
          o.input_divisor,
          o.full_capacity_bonus,
          o.use_domain_mineral ? 1 : 0,
          order++
        );
        for (const c of o.constraints) {
          insertConstraint.run(
            slug,
            o.card_id,
            c.constraining_card_id,
            c.scope,
            c.numerator,
            c.denominator
          );
        }
      }
    }
  });

  tx();
}
