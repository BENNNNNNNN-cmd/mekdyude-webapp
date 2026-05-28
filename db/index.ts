import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  getBatimentSlugMapping,
  getStadeIdFromLegacySlug,
} from "../lib/reference-postgres";

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_PATH = path.join(DATA_DIR, "bicolline.db");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

let db: Database.Database | null = null;
let referenceMigrationDone = false;
let referenceMigrationPromise: Promise<void> | null = null;

const defaultClanMembers = [
  { id: "MEK001", characterName: "Ainmeil Mek Dyude" },
  { id: "MEK002", characterName: "Alysson Mek Dyude" },
  { id: "MEK003", characterName: "Amaryllis Mek Dyude" },
  { id: "MEK004", characterName: "An Barran Mek Dyude" },
  { id: "MEK005", characterName: "Anna Mek Dyude" },
  { id: "MEK006", characterName: "Cean Mek Dyude" },
  { id: "MEK007", characterName: "Coièg Mek Dyude" },
  { id: "MEK008", characterName: "Dame Zazi" },
  { id: "MEK009", characterName: "Dorcha Mek Dyude" },
  { id: "MEK010", characterName: "Fhaine Mek Dyude" },
  { id: "MEK011", characterName: "Gaìr Mek Dyude" },
  { id: "MEK012", characterName: "Kiartch Mek Dyude" },
  { id: "MEK013", characterName: "Leugh Seo Mek Dyude" },
  { id: "MEK014", characterName: "Maise Mek Dyude" },
  { id: "MEK015", characterName: "Milis Mek Duyde" },
  { id: "MEK016", characterName: "Ollamh Myk Dyude" },
  { id: "MEK017", characterName: "Phaïste Mek Dyude" },
  { id: "MEK018", characterName: "Poka Mek Dyude" },
  { id: "MEK019", characterName: "Saor Mek Dyude" },
  { id: "MEK020", characterName: "Sean Shaid Mek Dyude" },
  { id: "MEK021", characterName: "Siol Mek Dyude" },
  { id: "MEK022", characterName: "Sochair Mek Dyude" },
  { id: "MEK023", characterName: "Teth Iaran Mek Dyude" },
];

const LEGACY_REFERENCE_TABLES = [
  "card_substitutes",
  "building_inputs",
  "building_outputs",
  "building_output_constraints",
  "construction_costs",
  "maintenance_templates",
  "cards",
  "building_templates",
  "stage_templates",
];

export function getDb(): Database.Database {
  if (db) return db;

  const isNew = !fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);
  ensureTransactionLedgerSchema(db);

  if (isNew) seedDatabase(db);

  normalizeLegacyInventoryNames(db);
  ensureClanMembersSchema(db);
  ensureClanMembers(db);
  return db;
}

/**
 * Phase 2 migration: drop legacy reference tables and remap operational FK
 * fields from MekDyude-local slugs to Postgres canonical IDs.
 *
 * Idempotent: subsequent runs find no tables to drop and no slugs to migrate.
 *
 * Async because slug -> BAT_x / STADE_x lookups read from Postgres. Cached
 * after first successful run; subsequent calls return immediately.
 */
export async function ensureReferenceMigration(): Promise<void> {
  if (referenceMigrationDone) return;
  if (referenceMigrationPromise) return referenceMigrationPromise;

  referenceMigrationPromise = runReferenceMigration().then(() => {
    referenceMigrationDone = true;
  });
  return referenceMigrationPromise;
}

async function runReferenceMigration(): Promise<void> {
  const conn = getDb();

  conn.pragma("foreign_keys = OFF");
  try {
    rebuildOperationalTablesIfNeeded(conn);

    for (const table of LEGACY_REFERENCE_TABLES) {
      conn.exec(`DROP TABLE IF EXISTS ${table}`);
    }

    const buildingRows = conn
      .prepare("SELECT DISTINCT building_template_id FROM domain_buildings")
      .all() as Array<{ building_template_id: string }>;
    const stageRows = conn
      .prepare("SELECT DISTINCT stage_id FROM domains")
      .all() as Array<{ stage_id: string }>;

    const needsBuildingMigration = buildingRows.some(
      (r) => !r.building_template_id.startsWith("BAT_")
    );
    const needsStageMigration = stageRows.some((r) => !r.stage_id.startsWith("STADE_"));

    if (needsBuildingMigration) {
      const slugMap = await getBatimentSlugMapping();
      const buildingEntries: Array<{ from: string; to: string }> = [];
      for (const row of buildingRows) {
        if (row.building_template_id.startsWith("BAT_")) continue;
        const target = slugMap.get(row.building_template_id);
        if (!target) {
          console.warn(
            `[migration] domain_buildings.building_template_id="${row.building_template_id}" doesn't map to any BAT_*; row left as-is`
          );
          continue;
        }
        buildingEntries.push({ from: row.building_template_id, to: target });
      }
      const updateBuilding = conn.prepare(
        "UPDATE domain_buildings SET building_template_id = ? WHERE building_template_id = ?"
      );
      const buildingTx = conn.transaction(() => {
        for (const { from, to } of buildingEntries) updateBuilding.run(to, from);
      });
      buildingTx();
    }

    if (needsStageMigration) {
      const stageEntries: Array<{ from: string; to: string }> = [];
      for (const row of stageRows) {
        if (row.stage_id.startsWith("STADE_")) continue;
        const target = await getStadeIdFromLegacySlug(row.stage_id);
        if (!target) {
          console.warn(
            `[migration] domains.stage_id="${row.stage_id}" doesn't map to any STADE_*; row left as-is`
          );
          continue;
        }
        stageEntries.push({ from: row.stage_id, to: target });
      }
      const updateStage = conn.prepare("UPDATE domains SET stage_id = ? WHERE stage_id = ?");
      const stageTx = conn.transaction(() => {
        for (const { from, to } of stageEntries) updateStage.run(to, from);
      });
      stageTx();
    }
  } finally {
    conn.pragma("foreign_keys = ON");
  }
}

// Pre-Phase-2 DBs declared FKs from domains.stage_id → stage_templates(id) and
// domain_buildings.building_template_id → building_templates(id). Phase 2 drops
// those parent tables, which would leave dangling FKs and break any future
// UPDATE on those columns. Rebuild the two tables to match the new schema.
function rebuildOperationalTablesIfNeeded(conn: Database.Database): void {
  const domainsSql =
    (
      conn
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'domains'")
        .get() as { sql: string } | undefined
    )?.sql ?? "";

  const needsRebuild =
    domainsSql.includes("REFERENCES stage_templates") ||
    domainsSql.includes("REFERENCES building_templates");

  if (!needsRebuild) return;

  conn.exec(`
    BEGIN;

    CREATE TABLE domains_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      guild_id TEXT NOT NULL REFERENCES guilds(id),
      stage_id TEXT NOT NULL,
      province_id TEXT NOT NULL REFERENCES provinces(id),
      fief_id TEXT REFERENCES fiefs(id),
      production_type TEXT NOT NULL,
      syta_quadrant TEXT,
      deposit_type TEXT,
      deposit_size TEXT,
      coord_x INTEGER,
      coord_y INTEGER,
      is_coastal BOOLEAN DEFAULT FALSE,
      buildings_used INTEGER DEFAULT 0,
      buildings_max INTEGER DEFAULT 0
    );
    INSERT INTO domains_new SELECT * FROM domains;

    CREATE TABLE domain_buildings_new (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains_new(id),
      building_template_id TEXT NOT NULL,
      assigned_count INTEGER DEFAULT 0,
      UNIQUE(domain_id, building_template_id)
    );
    INSERT INTO domain_buildings_new SELECT * FROM domain_buildings;

    DROP TABLE domain_buildings;
    DROP TABLE domains;

    ALTER TABLE domains_new RENAME TO domains;
    ALTER TABLE domain_buildings_new RENAME TO domain_buildings;

    COMMIT;
  `);
}

function ensureTransactionLedgerSchema(conn: Database.Database): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL REFERENCES guilds(id),
      type TEXT NOT NULL CHECK (type IN ('credit', 'dette', 'loc', 'paie', 'enca', 'correction')),
      status TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'regle', 'annule', 'litige')),
      date TEXT NOT NULL,
      season TEXT NOT NULL,
      counterparty_type TEXT NOT NULL CHECK (counterparty_type IN ('guild', 'member', 'external')),
      counterparty_id TEXT,
      counterparty_name TEXT NOT NULL,
      resource_name TEXT NOT NULL,
      resource_qty INTEGER NOT NULL DEFAULT 0 CHECK (resource_qty >= 0),
      counter_solar INTEGER NOT NULL DEFAULT 0 CHECK (counter_solar >= 0),
      counter_solar_direction TEXT CHECK (counter_solar_direction IN ('in', 'out') OR counter_solar_direction IS NULL),
      note TEXT,
      original_transaction_id INTEGER REFERENCES transactions(id),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sealed_at TEXT NOT NULL DEFAULT (datetime('now')),
      cancelled_at TEXT,
      cancelled_by TEXT,
      cancellation_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tx_guild_date ON transactions(guild_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_tx_original ON transactions(original_transaction_id);
  `);

  const columns = conn
    .prepare("PRAGMA table_info(transactions)")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("original_transaction_id")) {
    conn.exec("ALTER TABLE transactions ADD COLUMN original_transaction_id INTEGER REFERENCES transactions(id)");
    conn.exec("CREATE INDEX IF NOT EXISTS idx_tx_original ON transactions(original_transaction_id)");
  }
}

function seedDatabase(db: Database.Database) {
  const seedPath = path.join(process.cwd(), "public", "seed_data.json");
  const seedData = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  const initialAdminUsername = process.env.INITIAL_ADMIN_USERNAME;
  const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;

  db.exec("BEGIN");

  try {
    if (initialAdminUsername || initialAdminPassword) {
      if (!initialAdminUsername || !initialAdminPassword) {
        throw new Error(
          "INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD must both be set to seed an admin user"
        );
      }

      const insertUser = db.prepare(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
      );
      const adminHash = hashPassword(initialAdminPassword);
      insertUser.run(initialAdminUsername, adminHash, "admin");
    }

    const insertGuild = db.prepare("INSERT INTO guilds (id, name) VALUES (?, ?)");
    const guilds = [
      { id: "mek_dyude", name: "Mek Dyude" },
      { id: "caldwell", name: "Caldwell" },
      { id: "macrae", name: "MacRae" },
      { id: "macmairt", name: "Mac'Mairt" },
    ];
    for (const g of guilds) insertGuild.run(g.id, g.name);

    const insertProvince = db.prepare(
      "INSERT INTO provinces (id, name, region, is_independent) VALUES (?, ?, ?, ?)"
    );
    insertProvince.run("iles_celtes", "Îles Celtes", null, 1);
    insertProvince.run("dinant", "Dinant", "Fédération argannaise", 0);

    const insertFief = db.prepare(
      "INSERT INTO fiefs (id, name, province_id) VALUES (?, ?, ?)"
    );
    insertFief.run("dalryada", "Dalryada", "iles_celtes");
    insertFief.run("tara", "Tara", "iles_celtes");
    insertFief.run("pecheux", "Pécheux", "dinant");

    const insertDomain = db.prepare(`
      INSERT INTO domains (id, name, guild_id, stage_id, province_id, fief_id, production_type, syta_quadrant, deposit_type, deposit_size, coord_x, coord_y, is_coastal, buildings_used, buildings_max)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDomainBuilding = db.prepare(`
      INSERT INTO domain_buildings (id, domain_id, building_template_id, assigned_count)
      VALUES (?, ?, ?, ?)
    `);

    // Seed uses legacy slug-style IDs; ensureReferenceMigration() rewrites them
    // to BAT_*/STADE_* on first boot once Postgres is reachable.
    const domainsData = [
      {
        id: "kewtail", name: "Kewtail", guild_id: "mek_dyude",
        stage_id: "bourgade", province_id: "iles_celtes", fief_id: "dalryada",
        production_type: "ressource", syta_quadrant: "Centre",
        deposit_type: "Pierre précieuse", deposit_size: "Grand",
        coord_x: 103, coord_y: 69, is_coastal: true,
        buildings_used: 4, buildings_max: 10,
        buildings: [
          { template: "camp_de_bucherons", assigned: 10 },
          { template: "faubourg", assigned: 10 },
          { template: "grande_mine", assigned: 20 },
          { template: "palissade", assigned: 0 },
        ],
      },
      {
        id: "kintyre", name: "Kintyre", guild_id: "mek_dyude",
        stage_id: "village", province_id: "iles_celtes", fief_id: "dalryada",
        production_type: "ressource", syta_quadrant: "Centre",
        deposit_type: null, deposit_size: null,
        coord_x: 101, coord_y: 68, is_coastal: true,
        buildings_used: 16, buildings_max: 16,
        buildings: [
          { template: "abbaye", assigned: 3 },
          { template: "amphitheatre", assigned: 0 },
          { template: "atelier", assigned: 10 },
          { template: "camp_de_bucherons", assigned: 10 },
          { template: "chapelle", assigned: 5 },
          { template: "chaumieres", assigned: 10 },
          { template: "ecole_de_charpentiers", assigned: 5 },
          { template: "ecole_de_macons", assigned: 5 },
          { template: "faubourg", assigned: 10 },
          { template: "forge", assigned: 10 },
          { template: "fortin", assigned: 0 },
          { template: "habitations", assigned: 10 },
          { template: "manoir", assigned: 0 },
          { template: "palissade", assigned: 0 },
          { template: "quai", assigned: 5 },
          { template: "universite", assigned: 5 },
        ],
      },
      {
        id: "dramelay", name: "Dramelay", guild_id: "mek_dyude",
        stage_id: "bourgade", province_id: "dinant", fief_id: "pecheux",
        production_type: "cereale", syta_quadrant: "Sud",
        deposit_type: null, deposit_size: null,
        coord_x: 86, coord_y: 87, is_coastal: false,
        buildings_used: 7, buildings_max: 10,
        buildings: [
          { template: "caserne", assigned: 0 },
          { template: "champs", assigned: 10 },
          { template: "chaumieres", assigned: 10 },
          { template: "ecole_de_forgerons", assigned: 5 },
          { template: "grange", assigned: 15 },
          { template: "moulin", assigned: 10 },
          { template: "palissade", assigned: 0 },
        ],
      },
    ];

    for (const d of domainsData) {
      insertDomain.run(
        d.id, d.name, d.guild_id, d.stage_id, d.province_id, d.fief_id,
        d.production_type, d.syta_quadrant, d.deposit_type, d.deposit_size,
        d.coord_x, d.coord_y, d.is_coastal ? 1 : 0, d.buildings_used, d.buildings_max
      );
      for (const b of d.buildings) {
        insertDomainBuilding.run(`${d.id}_${b.template}`, d.id, b.template, b.assigned);
      }
    }

    const insertInventory = db.prepare(`
      INSERT INTO inventory (guild_id, item_name, category, qty_coffre, qty_en_mains, qty_production, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of seedData.inventory) {
      let category = "ressource";
      const unitItems = [
        "Charpentier", "Chevalier", "Croyant", "Forgeron", "Ingénieur", "Intendant",
        "Laborantins", "Maçon", "Marin", "Mentor Mil.", "Milice", "Sold. de métier",
        "Admirateurs", "Paysans", "Fiche de population", "Aventurier", "Doms",
      ];
      const specialItems = ["Sceau Occulte", "Sceau Exploration", "Composante surnaturelles", "Faveur divine", "Objet de coll."];
      const influenceItems = ["Inf. Empire", "Inf. Irendille", "Inf. Terre des Brumes"];

      if (unitItems.includes(item.item)) category = "unite";
      else if (specialItems.includes(item.item)) category = "objet";
      else if (influenceItems.includes(item.item)) category = "influence";

      insertInventory.run(
        "mek_dyude", item.item, category,
        item.coffre ?? 0, item.en_mains ?? 0, item.production ?? 0,
        item.notes || null
      );
    }

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

function ensureClanMembersSchema(conn: Database.Database) {
  const columns = conn
    .prepare("PRAGMA table_info(clan_members)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "photo")) {
    conn.exec("ALTER TABLE clan_members ADD COLUMN photo TEXT");
  }
}

function ensureClanMembers(db: Database.Database) {
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO clan_members (id, guild_id, character_name, real_name, email, phone, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMembers = db.transaction(() => {
    defaultClanMembers.forEach((member, index) => {
      insertMember.run(
        member.id,
        "mek_dyude",
        member.characterName,
        null,
        null,
        null,
        index + 1
      );
    });
  });

  insertMembers();
}

function normalizeLegacyInventoryNames(db: Database.Database) {
  const legacyRows = db
    .prepare("SELECT * FROM inventory WHERE guild_id = ? AND lower(item_name) = 'solaris'")
    .all("mek_dyude") as Array<{
      item_name: string;
      qty_coffre: number;
      qty_en_mains: number;
      qty_production: number;
      notes: string | null;
    }>;

  if (legacyRows.length === 0) return;

  const renameLegacyRows = db.transaction(() => {
    const solar = db
      .prepare("SELECT item_name FROM inventory WHERE guild_id = ? AND lower(item_name) = 'solar'")
      .get("mek_dyude") as { item_name: string } | undefined;

    if (solar) {
      const merge = db.prepare(`
        UPDATE inventory
        SET qty_coffre = qty_coffre + ?,
            qty_en_mains = qty_en_mains + ?,
            qty_production = qty_production + ?,
            notes = COALESCE(notes, ?)
        WHERE guild_id = ? AND item_name = ?
      `);
      const removeLegacy = db.prepare(
        "DELETE FROM inventory WHERE guild_id = ? AND item_name = ?"
      );

      for (const row of legacyRows) {
        merge.run(
          row.qty_coffre,
          row.qty_en_mains,
          row.qty_production,
          row.notes,
          "mek_dyude",
          solar.item_name
        );
        removeLegacy.run("mek_dyude", row.item_name);
      }
      return;
    }

    db.prepare("UPDATE inventory SET item_name = 'Solar' WHERE guild_id = ? AND lower(item_name) = 'solaris'")
      .run("mek_dyude");
  });

  renameLegacyRows();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [salt, storedKey] = hash.split(":");
  const key = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(storedKey, "hex"), key);
}
