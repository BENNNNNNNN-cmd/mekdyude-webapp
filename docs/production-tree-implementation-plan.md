# Production Tree — Implementation Plan

**Status:** Approved scope (Phase 1 + 2 + 3, FR labels, new "Planification" section).
**Engine architecture:** Bidirectional from day one.

---

## Confirmed facts (from live data inspection)

- **Bicolline data**: 121 cards, 69 buildings, 50 producing, 1 cross-card constraint (Château capped by Fiche pop. at fief scope), 10 buildings with full-capacity bonuses (Cathédrale +1, others +5).
- **Your data**: 53 buildings, all 53 exist in bicolline by exact name match. Bicolline has 16 you don't (Astrolabe, Autel sacrificiel, Brasserie, Cercle rituel, Citadelle, Comptoir commercial, Crypte, Dolmen, Glyphe de protection, Grand colisée, Laboratoire, Lieu ancestral, Patenterie, Pentacle, Réfectoire, Tour de garde côtière).
- **ID system mismatch**: yours uses slugs (`camp_de_bucherons`), theirs uses ints (`30`). Bridge by name.
- **Seed source**: three JSON files dropped in `db/seed-data/{cards,buildings,buildings_by_input_card}.json`.

---

## Schema changes — `db/schema.sql`

```sql
-- Map your slug IDs to bicolline numeric IDs (and store category, substitutes)
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,                    -- bicolline numeric id
  title TEXT NOT NULL UNIQUE,                -- display name (FR)
  category TEXT NOT NULL,                    -- "1"..."10" per bicolline taxonomy
  notes TEXT
);

CREATE TABLE IF NOT EXISTS card_substitutes (
  card_id INTEGER NOT NULL REFERENCES cards(id),
  substitute_card_id INTEGER NOT NULL REFERENCES cards(id),
  PRIMARY KEY (card_id, substitute_card_id)
);

-- Bridge: your slug → bicolline int
ALTER TABLE building_templates ADD COLUMN bicolline_id INTEGER;        -- nullable, fills via name match
ALTER TABLE building_templates ADD COLUMN input_divisor INTEGER DEFAULT 1;
ALTER TABLE building_templates ADD COLUMN full_capacity_bonus INTEGER DEFAULT 0;
ALTER TABLE building_templates ADD COLUMN use_domain_mineral BOOLEAN DEFAULT FALSE;

-- Production rows (replaces single resource_produced/ratio_per_unit for multi-output buildings like Abbaye)
-- Keep old columns for back-compat; new code reads from this table.
CREATE TABLE IF NOT EXISTS building_outputs (
  building_id TEXT NOT NULL REFERENCES building_templates(id),
  output_card_id INTEGER NOT NULL REFERENCES cards(id),
  quantity_per_input INTEGER NOT NULL,
  input_divisor INTEGER NOT NULL DEFAULT 1,
  full_capacity_bonus INTEGER NOT NULL DEFAULT 0,
  use_domain_mineral BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (building_id, output_card_id)
);

-- A building can accept any of N input cards (substitutes)
CREATE TABLE IF NOT EXISTS building_inputs (
  building_id TEXT NOT NULL REFERENCES building_templates(id),
  input_card_id INTEGER NOT NULL REFERENCES cards(id),
  max_quantity INTEGER NOT NULL,             -- = building capacity
  PRIMARY KEY (building_id, input_card_id)
);

-- Cross-card constraints (Château: 15 Paysan/Intendant capped by 1/2 Fiche pop. per fief)
CREATE TABLE IF NOT EXISTS building_output_constraints (
  building_id TEXT NOT NULL REFERENCES building_templates(id),
  output_card_id INTEGER NOT NULL,
  constraining_card_id INTEGER NOT NULL REFERENCES cards(id),
  scope TEXT NOT NULL CHECK(scope IN ('domain','fief','province','region')),
  numerator INTEGER NOT NULL,
  denominator INTEGER NOT NULL,
  PRIMARY KEY (building_id, output_card_id, constraining_card_id)
);
```

**Why additive instead of rewriting `building_templates`:** your `domain_buildings.building_template_id` already foreign-keys to slug IDs. A rewrite breaks that and costs nothing extra. The new tables hold the bicolline data that supplements yours.

---

## File-by-file plan

### Phase 0 — Schema + seed (1 evening)

| File | Action | Purpose |
|---|---|---|
| `db/schema.sql` | Edit | Add tables/columns above. |
| `db/seed-bicolline.ts` | New | Load 3 JSON files, populate `cards`, `card_substitutes`, `building_outputs`, `building_inputs`, `building_output_constraints`. Match `building_templates` rows by name; backfill `bicolline_id`. Insert the 16 missing buildings as new `building_templates` rows (slugified IDs). |
| `db/seed-data/cards.json` | ✅ Done | 121 cards. |
| `db/seed-data/buildings.json` | ✅ Done | 69 buildings. |
| `db/seed-data/buildings_by_input_card.json` | ✅ Done | Reverse index. |
| `db/migrate.ts` | New | One-shot runner: applies schema deltas, then runs `seed-bicolline.ts`. Idempotent. |

### Phase 1 — Generic forward tree (1 day)

| File | Action | Purpose |
|---|---|---|
| `lib/production-tree/engine.ts` | New | Pure functions: `getBuildingsConsuming(cardId)`, `getOutputsOf(buildingId)`, `expandNode(cardId, parents)` for loop-detection. Reads from new tables. |
| `lib/production-tree/types.ts` | New | TS types: `Card`, `Building`, `Output`, `TreeNode`, `Constraint`. |
| `app/api/production-tree/route.ts` | New | `GET /api/production-tree?card=36` — returns flat or nested tree. |
| `app/api/cards/route.ts` | New | `GET /api/cards` — list for dropdown. |
| `app/planification/layout.tsx` | New | New top-level section. |
| `app/planification/page.tsx` | New | Section landing — links to "Arbre de production", "Planificateur inverse" (Phase 3). |
| `app/planification/arbre/page.tsx` | New | Generic tree view (Phase 1 output). |
| `app/components/planification/CardPicker.tsx` | New | Dropdown + search input combo (mirrors bicolline UI). |
| `app/components/planification/TreeNode.tsx` | New | Recursive tree node component. Caret expand/collapse. "déjà affiché" loop badge. |
| `app/components/Sidebar.tsx` | Edit | Add "Planification" item between Inventaire and Règles. |

### Phase 2 — Live state overlay (2-3 days)

| File | Action | Purpose |
|---|---|---|
| `lib/production-tree/overlay.ts` | New | `annotateNode(node, guildState)` — for each building in the tree, classify as ✓ built / ⚠ buildable / ✗ blocked, with a `reason` string. |
| `lib/production-tree/buildability.ts` | New | Existing `lib/construction.ts` logic, factored out and reused: slot count, deposit, prerequisite, production_type, resources. |
| `app/api/guild-state/route.ts` | New | `GET /api/guild-state` — bundles domains + domain_buildings + inventory in one shot for the overlay. |
| `app/planification/arbre/page.tsx` | Edit | Add toggle "Vue générique" / "Avec mon état" (default: avec mon état). |
| `app/components/planification/TreeNode.tsx` | Edit | Render ✓/⚠/✗ chips and reason hover tooltip. |

### Phase 3 — Reverse planner (4-6 days)

| File | Action | Purpose |
|---|---|---|
| `lib/production-tree/reverse.ts` | New | `findPathsTo(targetCardId, qty, guildState)` — BFS on the reverse graph (buildings producing the target), generates option list. |
| `lib/production-tree/scoring.ts` | New | Score options by: construction cost vs inventory, slot availability, maintenance impact, simplicity. |
| `app/api/production-tree/reverse/route.ts` | New | `GET /api/production-tree/reverse?card=54&qty=50` |
| `app/planification/inverse/page.tsx` | New | Reverse planner UI: target + quantity input, ranked option list. |
| `app/components/planification/OptionCard.tsx` | New | Renders one option (building to add/staff, where, costs, scoring). |

---

## Engine design (bidirectional, used by all 3 phases)

```ts
// Forward: card → buildings that consume it → their outputs → recurse
function expandForward(cardId: number, ancestry: Set<number>): TreeNode

// Reverse: target card + qty → buildings that produce it (resolving substitutes) → for each, what inputs they need → recurse
function expandReverse(targetCardId: number, neededQty: number, ancestry: Set<number>): ReverseNode

// Substitute resolution: when card X is requested, also consider its substitutes
function resolveInputs(cardId: number): number[]   // [self, ...substitutes]
```

Both walks share node memoization and loop detection (Faubourg → Paysan → Faubourg cycle).

---

## Open implementation questions

1. **Display the 16 new buildings (Crypte, Dolmen, Pentacle…) as constructible in your domains?** They produce Croyance/magic resources you don't currently track in inventory. Two paths:
   - (a) Insert them, mark visually as "non suivi" until you add the corresponding inventory rows.
   - (b) Insert them but hide from `/domaines` constructibility checks until you opt in per-building.
   Recommended: (a). They're real buildings, you may build them eventually. Hiding them is information loss.

2. **Constraint engine — implement Château fully or stub for v1?** It's the only one. ~1 hour to do properly. **Recommend: implement properly.**

3. **Substitute logic — where does it surface in UI?** When you pick "Paysan" in the tree, do we show it as one root or also expand the 7 substitutes (Esclave, Forestier, Marin, Nomade, Peau verte, Voelhoorn, Homme-bête)? Bicolline.online appears to show only the picked card. **Recommend: same. Add a "Inclure les substituts" toggle for power users.**
