-- USERS & AUTH
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LOOKUP: Game rules (read-only after seed)
CREATE TABLE IF NOT EXISTS building_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sphere TEXT NOT NULL,
  capacity INTEGER,
  assignment_type TEXT,
  resource_produced TEXT,
  ratio_per_unit INTEGER DEFAULT 0,
  domain_limitation TEXT,
  prerequisite_building TEXT,
  structure_points INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS construction_costs (
  building_id TEXT NOT NULL REFERENCES building_templates(id),
  resource_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (building_id, resource_type)
);

CREATE TABLE IF NOT EXISTS stage_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_buildings INTEGER NOT NULL,
  upgrade_mo INTEGER DEFAULT 0,
  upgrade_equipements INTEGER DEFAULT 0,
  upgrade_ingenieurs INTEGER DEFAULT 0,
  upgrade_intendants INTEGER DEFAULT 0,
  upgrade_influences INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_templates (
  stage_id TEXT NOT NULL REFERENCES stage_templates(id),
  resource_type TEXT NOT NULL,
  annual_cost INTEGER NOT NULL,
  PRIMARY KEY (stage_id, resource_type)
);

-- GEOGRAPHY
CREATE TABLE IF NOT EXISTS provinces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT,
  is_independent BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS fiefs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province_id TEXT NOT NULL REFERENCES provinces(id)
);

-- GAME STATE
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  stage_id TEXT NOT NULL REFERENCES stage_templates(id),
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

CREATE TABLE IF NOT EXISTS domain_buildings (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  building_template_id TEXT NOT NULL REFERENCES building_templates(id),
  assigned_count INTEGER DEFAULT 0,
  UNIQUE(domain_id, building_template_id)
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  qty_coffre INTEGER DEFAULT 0,
  qty_en_mains INTEGER DEFAULT 0,
  qty_production INTEGER DEFAULT 0,
  notes TEXT,
  UNIQUE(guild_id, item_name)
);
