import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_PATH = path.join(DATA_DIR, "bicolline.db");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const isNew = !fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (isNew) {
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    db.exec(schema);
    seedDatabase(db);
  } else {
    // Ensure new tables exist on existing databases
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    db.exec(schema);
  }

  return db;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function seedDatabase(db: Database.Database) {
  const seedPath = path.join(process.cwd(), "public", "seed_data.json");
  const seedData = JSON.parse(fs.readFileSync(seedPath, "utf-8"));

  db.exec("BEGIN");

  try {
    // Users — seed Admin account
    const insertUser = db.prepare(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
    );
    const adminHash = hashPassword("Cl@nM3kDyud3");
    insertUser.run("Admin", adminHash, "admin");

    // Guilds
    const insertGuild = db.prepare("INSERT INTO guilds (id, name) VALUES (?, ?)");
    const guilds = [
      { id: "mek_dyude", name: "Mek Dyude" },
      { id: "caldwell", name: "Caldwell" },
      { id: "macrae", name: "MacRae" },
      { id: "macmairt", name: "Mac'Mairt" },
    ];
    for (const g of guilds) {
      insertGuild.run(g.id, g.name);
    }

    // Provinces
    const insertProvince = db.prepare(
      "INSERT INTO provinces (id, name, region, is_independent) VALUES (?, ?, ?, ?)"
    );
    insertProvince.run("iles_celtes", "Îles Celtes", null, 1);
    insertProvince.run("dinant", "Dinant", "Fédération argannaise", 0);

    // Fiefs
    const insertFief = db.prepare(
      "INSERT INTO fiefs (id, name, province_id) VALUES (?, ?, ?)"
    );
    insertFief.run("dalryada", "Dalryada", "iles_celtes");
    insertFief.run("tara", "Tara", "iles_celtes");
    insertFief.run("pecheux", "Pécheux", "dinant");

    // Stage templates
    const insertStage = db.prepare(
      "INSERT INTO stage_templates (id, name, max_buildings) VALUES (?, ?, ?)"
    );
    const stages = [
      { id: "campement", name: "Campement", max: 3 },
      { id: "hameau", name: "Hameau", max: 6 },
      { id: "bourgade", name: "Bourgade", max: 10 },
      { id: "village", name: "Village", max: 16 },
      { id: "ville", name: "Ville", max: 23 },
      { id: "cite", name: "Cité", max: 35 },
    ];
    for (const s of stages) {
      insertStage.run(s.id, s.name, s.max);
    }

    // Maintenance templates
    const insertMaint = db.prepare(
      "INSERT INTO maintenance_templates (stage_id, resource_type, annual_cost) VALUES (?, ?, ?)"
    );
    const maintenance: Record<string, Record<string, number>> = seedData.maintenance_by_stage;
    for (const [stageId, costs] of Object.entries(maintenance)) {
      // Map accented stage IDs
      const dbStageId = stageId === "cité" ? "cite" : stageId;
      for (const [resource, amount] of Object.entries(costs)) {
        if (amount > 0) {
          insertMaint.run(dbStageId, resource, amount);
        }
      }
    }

    // Building templates
    const insertBuilding = db.prepare(`
      INSERT INTO building_templates (id, name, sphere, capacity, assignment_type, resource_produced, ratio_per_unit, domain_limitation, prerequisite_building, structure_points, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCost = db.prepare(
      "INSERT INTO construction_costs (building_id, resource_type, amount) VALUES (?, ?, ?)"
    );

    for (const bt of seedData.building_templates) {
      const id = slugify(bt.name);
      const capacity = typeof bt.capacity === "string" ? parseInt(bt.capacity) || 0 : (bt.capacity ?? 0);
      const ratio = typeof bt.ratio_per_unit === "string" ? 0 : (bt.ratio_per_unit ?? 0);
      const prereq = bt.prerequisite_building ? slugify(bt.prerequisite_building) : null;

      insertBuilding.run(
        id, bt.name, bt.sphere, capacity, bt.assignment_type,
        bt.resource_produced, ratio, bt.domain_limitation || null,
        prereq, bt.structure_points || 0, bt.notes || null
      );

      if (bt.construction_costs) {
        for (const [resource, amount] of Object.entries(bt.construction_costs)) {
          insertCost.run(id, resource, amount as number);
        }
      }
    }

    // Domains
    const insertDomain = db.prepare(`
      INSERT INTO domains (id, name, guild_id, stage_id, province_id, fief_id, production_type, syta_quadrant, deposit_type, deposit_size, coord_x, coord_y, is_coastal, buildings_used, buildings_max)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDomainBuilding = db.prepare(`
      INSERT INTO domain_buildings (id, domain_id, building_template_id, assigned_count)
      VALUES (?, ?, ?, ?)
    `);

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

    // Inventory
    const insertInventory = db.prepare(`
      INSERT INTO inventory (guild_id, item_name, category, qty_coffre, qty_en_mains, qty_production, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of seedData.inventory) {
      // Determine category based on item type
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
