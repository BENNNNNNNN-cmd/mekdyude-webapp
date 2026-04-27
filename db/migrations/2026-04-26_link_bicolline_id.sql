-- =============================================================================
-- Migration: 2026-04-26_link_bicolline_id
-- Purpose:   Make Postgres CatalogueCard the single source of truth for cards.
--            Adds bicollineId (nullable, unique-where-not-null) and backfills
--            from the reconciliation report (matched.csv, 116 rows + 5 inserts).
--
-- Run order: 1) add column + index   2) inserts for missing cards
--            3) backfill matched ids 4) verify counts
--
-- Reversible: yes — see ROLLBACK section at bottom.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Schema change: add bicollineId column
-- -----------------------------------------------------------------------------
ALTER TABLE "CatalogueCard"
  ADD COLUMN IF NOT EXISTS "bicollineId" INTEGER;

-- Unique only when not null (multiple NULLs allowed for catalog-only cards)
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogueCard_bicollineId_unique"
  ON "CatalogueCard" ("bicollineId")
  WHERE "bicollineId" IS NOT NULL;

COMMENT ON COLUMN "CatalogueCard"."bicollineId" IS
  'Numeric Bicolline card id from bicolline.online. NULL for catalog-only cards (ships, financial assets, fiches sub-types) that have no Bicolline production-tree counterpart.';

-- -----------------------------------------------------------------------------
-- 2. Insert the 5 missing cards (local-only after v4 reconciliation)
--    Each gets a generated cuid-style id (using gen_random_uuid as fallback;
--    Prisma will treat as opaque text id). Adjust id strategy if your Prisma
--    schema uses cuid() — in that case run via a Prisma migration instead.
-- -----------------------------------------------------------------------------

-- Helper: ensure pgcrypto for gen_random_uuid is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "CatalogueCard"
  (id, "nameFr", "nameEn", category, section, description, mechanic, "sortOrder", "bicollineId", "createdAt", "updatedAt")
VALUES
  -- Bicolline id 5 — Fiche de population (the GENERIC fiche, used as input by 16 buildings)
  ('mek_bic_005_fiche_pop', 'Fiche de population', 'Population Sheet',
   NULL, 'Fiches de population',
   'Fiche de population générique. Utilisée comme intrant par les bâtiments d''habitation, religieux et académiques.',
   'Input principal pour Chaumières, Habitations, Faubourg, Cathédrale, Laboratoire, Réfectoire, Crypte, Lieu ancestral, Cercle rituel, Dolmen, Autel sacrificiel, Pentacle, Patenterie, et autres. Distincte des sous-types (Activité, Grande Bataille, Campagne…) qui décrivent comment les fiches sont gagnées.',
   200, 5, NOW(), NOW()),

  -- Bicolline id 23 — Esprit
  ('mek_bic_023_esprit', 'Esprit', 'Spirit',
   'magique', 'Énergies magiques',
   'Énergie magique de type esprit.',
   'Produite par le Cercle rituel à partir de Fiches de population.',
   201, 23, NOW(), NOW()),

  -- Bicolline id 114 — Rune Naine
  ('mek_bic_114_rune_naine', 'Rune Naine', 'Dwarven Rune',
   'magique', 'Composantes surnaturelles',
   'Composante surnaturelle d''origine naine.',
   'Composante de fabrication.',
   202, 114, NOW(), NOW()),

  -- Bicolline id 145 — Potion d'eau bénite
  ('mek_bic_145_eau_benite', 'Potion d''eau bénite', 'Holy Water Potion',
   'occulte', 'Potions & babioles',
   'Potion d''eau bénite, efficace contre les morts-vivants et démons.',
   'Consommable de combat.',
   203, 145, NOW(), NOW()),

  -- Bicolline id 147 — Objet magique
  ('mek_bic_147_objet_magique', 'Objet magique', 'Magical Item',
   'magique', 'Objets spéciaux',
   'Objet imprégné de magie.',
   'Catégorie générique d''objet magique.',
   204, 147, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Backfill bicollineId for the 116 matched rows
--    (Generated from docs/reconciliation/matched.csv)
-- -----------------------------------------------------------------------------

-- Use a temp table approach so we can audit before commit.
CREATE TEMP TABLE _bicolline_backfill (
  pg_id TEXT PRIMARY KEY,
  bicolline_id INTEGER NOT NULL
);

-- The full INSERT comes from the companion file:
--   db/migrations/2026-04-26_link_bicolline_id_backfill.sql
-- It is split out so this migration stays readable.
\i 2026-04-26_link_bicolline_id_backfill.sql

UPDATE "CatalogueCard" cc
SET "bicollineId" = b.bicolline_id
FROM _bicolline_backfill b
WHERE cc.id = b.pg_id
  AND cc."bicollineId" IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Verification — fail loudly if counts disagree
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_matched     INTEGER;
  v_inserted    INTEGER;
  v_total_with  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_matched FROM _bicolline_backfill;
  SELECT COUNT(*) INTO v_inserted FROM "CatalogueCard" WHERE id LIKE 'mek_bic_%';
  SELECT COUNT(*) INTO v_total_with FROM "CatalogueCard" WHERE "bicollineId" IS NOT NULL;

  IF v_total_with <> (v_matched + v_inserted) THEN
    RAISE EXCEPTION 'Backfill mismatch: expected % rows with bicollineId, got %',
      v_matched + v_inserted, v_total_with;
  END IF;

  RAISE NOTICE 'OK — matched=%, inserted=%, total_with_bicollineId=%',
    v_matched, v_inserted, v_total_with;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (if needed):
--   BEGIN;
--   DELETE FROM "CatalogueCard" WHERE id LIKE 'mek_bic_%';
--   DROP INDEX IF EXISTS "CatalogueCard_bicollineId_unique";
--   ALTER TABLE "CatalogueCard" DROP COLUMN IF EXISTS "bicollineId";
--   COMMIT;
-- =============================================================================
