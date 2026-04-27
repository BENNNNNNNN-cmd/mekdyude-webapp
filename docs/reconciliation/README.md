# CatalogueCard ↔ local cards reconciliation — FINAL

**Date:** 2026-04-26
**Source of truth (target):** Postgres `public."CatalogueCard"` (Railway)
**Source being deprecated:** SQLite `cards` table (seeded from `db/seed-data/cards.json`)

## Final result (after v4 alias map)

| Bucket | Count | Disposition |
|---|---|---|
| Local cards (SQLite seed) | 121 | Source set |
| Postgres `CatalogueCard` rows | 175 | Target set |
| **Matched (auto)** | **116** | Backfill via `2026-04-26_link_bicolline_id.sql` |
| **Ambiguous** | **0** | — |
| **Local-only → INSERT** | **5** | Created by the migration with new ids `mek_bic_005/023/114/145/147` |
| **Postgres-only (no Bicolline id)** | **59** | Stay `bicollineId = NULL` — catalog-only cards (ships, financial assets, fiches sub-types) |

**Coverage: 121/121 local cards accounted for** (116 mapped + 5 inserted). Post-migration, 121 of 180 PG rows will have `bicollineId`; 59 will be NULL by design.

## What changed across the alias-map iterations

- **v1 (96 matches):** baseline alias map.
- **v2 (102 matches):** dropped a bad `Peau verte → Guerrier orque` alias; added 5 singular/plural aliases (Tromblon, Hommes-rats, Mentor d'aventurier, Points de pouvoir, Oeuvre).
- **v3 (114 matches):** added an `Influence` heuristic that strips `de`/`d'`/`des`/`la` prefixes — caught 12 per-region influences.
- **v4 / FINAL (116 matches):** explicit aliases for `Influence Fédération argannaise → Influence d'Arganne` and `Influence Autre région → Influence régionale`.

## Files

- `matched.csv` — 116 `bicolline_id → pg_id` pairs (drives the backfill SQL)
- `local_only.csv` — the 5 cards the migration inserts
- `postgres_only.csv` — 59 PG-only rows (informational; deliberately stay `bicollineId = NULL`)
- `ambiguous.csv` — empty

## Reversal of an earlier recommendation

I had initially suggested deprecating the generic `Fiche de population` (id 5) in favor of the PG sub-types (`Activité`, `Grande Bataille`, `Campagne`...). **Reversed.** The generic fiche is the input for **16 buildings** in `db/seed-data/buildings.json` (Chaumières, Habitations, Faubourg, Cathédrale, Laboratoire, Réfectoire, Crypte, Lieu ancestral, Cercle rituel, Dolmen, Autel sacrificiel, Pentacle, Patenterie, plus a few more). The PG sub-types describe *how fiches are earned*, not the buildings-input fiche itself. So the migration **adds** Fiche de population as a new CatalogueCard row (`mek_bic_005_fiche_pop`).

## What does NOT belong in this report

- `Item` table mappings — that's already handled by `CatalogueCardItemLink` (113 rows). 73 PG cards have no Item link, but that's a *separate* reconciliation (catalog ↔ inventory, not catalog ↔ production-tree).
</content>
