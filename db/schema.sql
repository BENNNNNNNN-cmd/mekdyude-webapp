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

CREATE TABLE IF NOT EXISTS clan_members (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id),
  character_name TEXT NOT NULL,
  real_name TEXT,
  email TEXT,
  phone TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clan_members_guild_sort ON clan_members(guild_id, sort_order);

-- DOCUMENTS
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  display_name TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);

-- =============================================================================
-- PRODUCTION TREE — bicolline.online dataset
-- Cards (resources, units, items) keyed by bicolline numeric id.
-- building_templates is bridged by name; bicolline_id column added via migration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_cards_category ON cards(category);

-- card X is interchangeable with substitute_card_id when used as building input
CREATE TABLE IF NOT EXISTS card_substitutes (
  card_id INTEGER NOT NULL REFERENCES cards(id),
  substitute_card_id INTEGER NOT NULL REFERENCES cards(id),
  PRIMARY KEY (card_id, substitute_card_id)
);

-- A building can accept any of N input cards (capacity is per accepted card)
CREATE TABLE IF NOT EXISTS building_inputs (
  building_id TEXT NOT NULL REFERENCES building_templates(id),
  input_card_id INTEGER NOT NULL REFERENCES cards(id),
  max_quantity INTEGER NOT NULL,
  PRIMARY KEY (building_id, input_card_id)
);

CREATE INDEX IF NOT EXISTS idx_building_inputs_card ON building_inputs(input_card_id);

-- Each building can have N output rows (e.g. Abbaye produces V + É + A from one input)
CREATE TABLE IF NOT EXISTS building_outputs (
  building_id TEXT NOT NULL REFERENCES building_templates(id),
  output_card_id INTEGER NOT NULL REFERENCES cards(id),
  quantity_per_input INTEGER NOT NULL,
  input_divisor INTEGER NOT NULL DEFAULT 1,
  full_capacity_bonus INTEGER NOT NULL DEFAULT 0,
  use_domain_mineral INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (building_id, output_card_id)
);

CREATE INDEX IF NOT EXISTS idx_building_outputs_card ON building_outputs(output_card_id);

-- Cross-card constraints (e.g. Château: 15 Paysan/Intendant capped by 1/2 Fiche pop. per fief)
CREATE TABLE IF NOT EXISTS building_output_constraints (
  building_id TEXT NOT NULL REFERENCES building_templates(id),
  output_card_id INTEGER NOT NULL,
  constraining_card_id INTEGER NOT NULL REFERENCES cards(id),
  scope TEXT NOT NULL CHECK(scope IN ('domain','fief','province','region')),
  numerator INTEGER NOT NULL,
  denominator INTEGER NOT NULL,
  PRIMARY KEY (building_id, output_card_id, constraining_card_id)
);
