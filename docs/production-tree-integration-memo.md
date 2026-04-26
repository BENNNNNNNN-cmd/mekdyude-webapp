# Production Tree — Integration Memo

**Author:** Ben + Claude
**Date:** 2026-04-25
**Status:** Decision-ready. Needs your call on scope.

---

## TL;DR

The bicolline.online "Production Tree" is a **forward-chaining BOM explorer**: pick a card, see every building that consumes it, what they output, recursively. It is **generic** (rulebook-only) and **read-only** — it has no idea what *you* own, produce, or need.

Your MekDyude app already has the missing half: your domains, your buildings, your inventory, your stage maintenance. So porting the tool 1:1 is leaving 80% of the value on the table. Build it as a **first-class planning module** that overlays the generic graph with your live state. Three views, shared graph engine, incremental rollout.

**Recommendation:** Build the **Phase 1 + Phase 2** combo (Generic Tree + "What Can I Do With This?"). Phase 3 (Reverse Planner) is the killer feature but lift is bigger — make that a v2 once Phase 1 is in your hands.

---

## 1. What the bicolline.online tool actually does

```
Pick a card (resource or unit)
    ↓
Show every building where that card is an INPUT
    ↓
Under each building, show its OUTPUTS (with ratio + capacity + bonus + constraints)
    ↓
Click caret on an output → expand it as a new root → recurse
    ↓
Mark "déjà affiché" if a card already appeared upstream (loop guard)
```

**What it has:**
- Full card catalog (~150 cards across 10 categories)
- Full building catalog (~90 buildings) with `inputs`, `outputs`, `quantity_per_input`, `input_divisor`, `full_capacity_bonus`, `use_domain_mineral`, `constraints`
- Substitutes graph (Esclave / Forestier / Homme-bête / Marin / Nomade / Paysan / Peau verte / Voelhoorn are interchangeable as worker inputs)
- Constraints with scope (domain / fief / province / region) — e.g. Château: `36/Paysan` output capped by `5/Fiche pop. per fief at 1:2`

**What it does NOT have (where you win):**
- Your actual domains and what's built on them
- Your inventory (coffre + en mains + production)
- Your stage maintenance burden
- Any notion of "you" — it's an Excel-style reference, not a planner

---

## 2. Why this is gold for MekDyude

The mental model maps **cleanly** onto your existing schema:

```
bicolline.online             your DB
─────────────────            ──────────────────────────────
Card                  ←→     inventory.item_name (+ category)
Building              ←→     building_templates
Building inputs       ←→     assignment_type + ratio_per_unit
Building outputs      ←→     resource_produced + ratio_per_unit
Constraints           ←→     domain_limitation + (new) constraint table
Substitutes           ←→     (new) — currently missing in your seed
Capacity              ←→     building_templates.capacity
Full-capacity bonus   ←→     (new) — currently missing in your seed
```

**Three gaps to close in your seed before any of this is correct:**
1. **Substitutes table** — workers are interchangeable. Without this, "what can I do with my Paysans?" wrongly excludes buildings that take Forestier/Nomade/etc.
2. **Full-capacity bonus** — Autel sacrificiel, Cathédrale, Crypte, Dolmen, Laboratoire, Lieu ancestral, Patenterie, Pentacle all give +5 (or +1) bonus only at full capacity. Your current production calc misses this.
3. **Constraint table** — Château is the obvious one (output capped by Fiche de pop. at fief scope). Today you'd over-report production.

These gaps exist *whether or not* you build the production tree. They'll bite you elsewhere too. **Fix them as part of Phase 1.**

---

## 3. Three views, one engine

Architecturally: one graph engine on top of `building_templates` + new constraint/substitute tables. Three UIs sit on it.

### View A — Generic Tree (Phase 1) — *parity with bicolline.online*

The vanilla tool. Pick a card, expand the tree. Read-only reference. Lives at `/regles/production-tree` or as a tab inside `/regles`.

**Why bother?** It's the lowest-effort onboarding ramp. You learn the rules graphically. It's also the foundation for views B and C.

### View B — "What Can I Do With This?" (Phase 2) — *overlay your reality*

Same tree, but **annotated with your state**:

```
┌─ Paysan  [you have: 0 produced, 100 max from chaumières/faubourgs/habitations]
│
├─ 🏛 Camp de bûcherons   capacité 10 → Ressource (1 → 5)
│   └─ ✓ already built on Kewtail (10/10)
│   └─ ✓ already built on Kintyre (10/10) — you produce 100 Ressource/yr
│
├─ 🏛 Carrière   capacité 20 → Ressource (1 → 5)
│   └─ ✗ not built. Needs Kewtail or Kintyre slot — full
│   └─ ✗ Dramelay has 3 free slots but produces "céréale", not "ressource" → not eligible
│
├─ 🏛 Champs   capacité 10 → Céréale (1 → 5)
│   └─ ✓ Dramelay (10/10) — 50/yr
│
├─ 🏛 Mine   capacité 10 → Min. or (1 → 5)  ⚠ requires deposit "Minerai d'or"
│   └─ ✗ no domain has matching deposit
│
…
```

Each building node colors as ✓ already built / ⚠ buildable / ✗ blocked, with the *reason* it's blocked (slot full, wrong production_type, missing deposit, missing prerequisite, missing resources).

This is the question you actually ask in the game: *"I have X workers — where do I put them?"*

### View C — Reverse Planner (Phase 3) — *the killer feature*

Flip the question: **"I need 50 Équipements/year. Show me how to get there."**

```
TARGET: +50 Équipement/year   (current: 71, gap: -21)

OPTION 1 — Add 1 Atelier on Kintyre
   ✗ Kintyre full (16/16 buildings)
   
OPTION 2 — Add 1 Fabrique anywhere
   ⚠ buildable on Kewtail (4/10 free) or Dramelay (3/10 free)
   ⚠ Fabrique requires: 10 paysans → produces 50 équipements
   ⚠ Construction cost: [list from construction_costs vs your inventory]
   ⚠ Net annual maintenance impact: stage upgrade not required
   
OPTION 3 — Staff up Abbaye (Kintyre)
   3 croyants → 21V + 21É + 9A.  Add 2 more croyants = +14É (+4 max bonus if full at 5).
   ⚠ Need 2 more Croyants. Chapelle on Kintyre produces 5 Croyants/yr → already covered.
```

This is the strategic-planner version. Same graph engine, but walks **backward** from a desired output, scoring each option against your live constraints.

---

## 4. Phasing & effort

| Phase | What it delivers | Engineering lift | Value |
|---|---|---|---|
| **0 — Schema fix** | Substitutes, full-capacity bonus, constraints columns | 1 evening | Foundational. Required regardless. |
| **1 — Generic tree** | Read-only tree explorer in `/regles` | 1 day | Low — parity with bicolline tool. |
| **2 — "What can I do with this?"** | Same tree + your state overlay | 2-3 days | **High.** Daily-driver UX. |
| **3 — Reverse planner** | Target output → ranked options | 4-6 days | **Killer.** v2 candidate. |

Phase 0 → 1 → 2 is one continuous sprint, ~4-5 days. Phase 3 deserves its own block once you've used Phase 2 for a few sessions and your intuitions sharpen.

---

## 5. Data model deltas

```sql
-- new
CREATE TABLE card_substitutes (
  card_id TEXT NOT NULL,
  substitute_card_id TEXT NOT NULL,
  PRIMARY KEY (card_id, substitute_card_id)
);

-- new
CREATE TABLE building_constraints (
  building_id TEXT NOT NULL REFERENCES building_templates(id),
  output_resource TEXT NOT NULL,
  constraining_card TEXT NOT NULL,    -- e.g. "fiche_de_population"
  scope TEXT NOT NULL,                 -- "domain" | "fief" | "province" | "region"
  numerator INTEGER NOT NULL,          -- e.g. 1
  denominator INTEGER NOT NULL,        -- e.g. 2
  PRIMARY KEY (building_id, output_resource, constraining_card)
);

-- existing table, ALTER
ALTER TABLE building_templates ADD COLUMN full_capacity_bonus INTEGER DEFAULT 0;
ALTER TABLE building_templates ADD COLUMN input_divisor INTEGER DEFAULT 1;
ALTER TABLE building_templates ADD COLUMN use_domain_mineral BOOLEAN DEFAULT FALSE;
```

The bicolline.online tool's JSON dump is a **direct seed source** — it embeds the entire dataset on page load (cards object, buildings object, substitutes object). I can extract it once and convert to your schema. ~150 cards, ~90 buildings, fully ground-truthed against the rulebook.

That alone is worth the trip.

---

## 6. Risks / tradeoffs

- **Data drift.** If Bicolline updates rules mid-season (new building, balance change), our copy is stale. Mitigation: make the seed re-runnable; check the live tool quarterly and diff. (Bonus play: scrape it programmatically — it's all in the page JSON.)
- **Constraint engine complexity.** "Fief scope at 1:2 ratio of card X" is a real little compiler problem if you want it to work for arbitrary constraints. **Mitigation:** Phase 1 ignores constraints (just shows them as ⚠ flags). Phase 3 implements them properly.
- **UX of deep trees.** Some chains go 4+ levels deep. The bicolline tool handles this with click-to-expand. Copy the pattern — don't auto-expand everything.
- **You're already living without it.** This is enhancement, not bug-fix. Worth weighing against fixing the 5.5 (Syta) and other "future iterations" you parked.

---

## 7. What I'd do Monday morning

1. **Approve scope** (this memo). Pick Phase 1+2 or full 1+2+3.
2. **Phase 0 schema migration** — I write the migration + seed extractor script that pulls the bicolline.online JSON and lands it in your DB. Output: a clean, ground-truthed seed that fixes the substitute/bonus/constraint gaps your current data has.
3. **Phase 1 component** — single page at `/regles/production-tree`. Generic forward tree. Reuses bicolline.online's UX (it's good).
4. **Phase 2 overlay layer** — wires in `domains`, `domain_buildings`, `inventory`. Adds the ✓/⚠/✗ annotations and reason strings.
5. **Pause, use it for a session, then decide on Phase 3.**

---

## 8. Open questions for you

1. **Where in your nav?** Standalone "Production" tab in sidebar? Tab inside `/regles`? Inline on `/domaines`? My preference: **new top-level "Planning" section** that will eventually also house the Reverse Planner (Phase 3) and possibly the construction projects view.
2. **FR/EN labels?** The data is FR-native. Building names, cards, scopes — keep FR (matches game). UI chrome (buttons, headers): your call. Recommend FR for parity with the rest of MekDyude.
3. **Phase 3 in scope or not for v1?** Drives whether I architect the engine for forward-only (cheap) or bidirectional (expensive but future-proof). My recommendation: build bidirectional from day one — the cost delta is small and it pays back enormously.

---

## Appendix A — Building/output examples from the live data

```
Camp de bûcherons    inputs: 10 Paysan        outputs: 5 Ressource per Paysan
Champs               inputs: 10 Paysan        outputs: 5 Céréale per Paysan
Mine                 inputs: 10 Paysan        outputs: 5 Min. or per Paysan  [needs domain deposit]
Abbaye               inputs:  5 Croyant       outputs: 7V + 7É + 3A per Croyant
Cathédrale           inputs: 10 Fiche pop.    outputs: 1 Pts pouvoir per 5 Fiche pop. + 1 bonus pleine capacité
Château              inputs:  5 Intendant     outputs: 15 Paysan per Intendant  [capped: ½ × Fiche pop. in fief]
Faubourg             inputs: 10 Fiche pop.    outputs: 2 Paysan per Fiche pop.
```

The "1 → 3" notation in the UI is `input_divisor → quantity_per_input`. So Cathédrale's `1 → 5, divisor 5` reads as: every 5 inputs produce 1 output, then ratio applies → 1 pt pouvoir per 5 fiche pop., +1 bonus when at full 10/10.

---

*End memo.*
