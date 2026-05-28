-- USERS & AUTH
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- Reference data (cards, buildings, stages, costs, effects) lives in shared
-- Postgres as of Phase 2 (2026-04-30) — see lib/reference-postgres.ts.
-- The legacy SQLite reference tables (cards, card_substitutes,
-- building_templates, building_inputs, building_outputs,
-- building_output_constraints, construction_costs, stage_templates,
-- maintenance_templates) are dropped at startup by ensureReferenceMigration().
--
-- Operational tables below — these stay in SQLite forever.
-- =============================================================================

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

-- domains.stage_id holds Postgres Stade.id (STADE_*) — no FK because the
-- referent is in another database. Migrated from slug-style by
-- ensureReferenceMigration().
CREATE TABLE IF NOT EXISTS domains (
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

-- domain_buildings.building_template_id holds Postgres Batiment.id (BAT_*)
-- — no FK because the referent is in another database. Migrated from
-- slug-style by ensureReferenceMigration().
CREATE TABLE IF NOT EXISTS domain_buildings (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  building_template_id TEXT NOT NULL,
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
  photo TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clan_members_guild_sort ON clan_members(guild_id, sort_order);

-- TRANSACTION LEDGER
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
