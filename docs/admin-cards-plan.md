# /admin/cards — implementation plan

**Goal:** A Next.js page in `bicolline-manager` that is the *only* place anyone edits CatalogueCard rows in Postgres. Postgres is the source of truth (post-migration); SQLite seed data becomes derived/read-only.

**Stack constraints (from the existing app):**
- Next.js 16.2.1 App Router (the AGENTS.md warns the conventions differ from older Next — read `node_modules/next/dist/docs/` before coding).
- React 19.
- Auth: JWT cookie `session` decoded via `lib/session.ts`; `proxy.ts` enforces login. Roles already in payload.
- Existing DB I/O pattern: `app/api/*/route.ts` files, sync access via `getDb()` for SQLite. **For CatalogueCard we use `pg` instead.** A `lib/market-prices.ts` already shows the working `Pool` pattern — copy it.
- Style: Tailwind v4 + the existing `AppShell` / `Sidebar` look-and-feel.
- Audit log already exists in Postgres (`AuditLog` table) — wire every write to it.

---

## 1. RBAC — who can see and do what

Two new roles in addition to the existing `admin` / `viewer`:

| Role         | Can read /admin/cards | Can edit | Can create | Can delete | Can set bicollineId |
|--------------|----------------------|----------|------------|------------|---------------------|
| `admin`      | yes                  | yes      | yes        | yes (soft) | yes                 |
| `catalog_editor` | yes              | yes      | yes        | no         | no                  |
| `viewer`     | no                   | —        | —          | —          | —                   |

Hard-delete is forbidden in the UI. Soft-delete = mark `isActive = false` (add column in same migration if not present; today CatalogueCard has no isActive — `Item` does).

**Auth gate (server-side, every request):**
- Page: `getSession()` → if `role` not in `['admin','catalog_editor']` → `redirect('/')`.
- API routes: same check inline; return 403 otherwise.

---

## 2. Data layer — `lib/catalogue.ts` (NEW)

Mirror the `Pool` pattern from `lib/market-prices.ts`. One module owns all CatalogueCard I/O so the API routes stay thin.

Exports:
```ts
export interface CatalogueCard {
  id: string;
  bicollineId: number | null;
  nameFr: string;
  nameEn: string | null;
  category: string | null;
  section: string;
  description: string | null;
  mechanic: string | null;
  cost: string | null;
  stats: string | null;
  tier: string | null;
  fc: number | null;
  speed: number | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // computed
  itemLinkCount: number;
}

export async function listCards(opts?: { search?: string; section?: string; onlyOrphans?: boolean }): Promise<CatalogueCard[]>;
export async function getCard(id: string): Promise<CatalogueCard | null>;
export async function createCard(input: NewCard, actor: ActorContext): Promise<CatalogueCard>;
export async function updateCard(id: string, patch: Partial<CatalogueCard>, actor: ActorContext): Promise<CatalogueCard>;
export async function softDeleteCard(id: string, actor: ActorContext): Promise<void>;
export async function setBicollineId(id: string, bicollineId: number | null, actor: ActorContext): Promise<void>;
export async function listSections(): Promise<string[]>;
```

Each write wraps in a transaction:
1. Validate (bicollineId uniqueness, nameFr non-empty, section in enum).
2. UPDATE row.
3. INSERT into `AuditLog` with `{action, tableName: 'CatalogueCard', recordId, before, after, userId, timestamp}`.
4. COMMIT.

Cuid generation for new cards: use the `cuid2` package or call the same generator Prisma uses if available; otherwise prefix with `mek_` like the migration does. **Decision needed:** I recommend installing `@paralleldrive/cuid2` to match Prisma's id style for the rest of the table.

---

## 3. API routes — `app/api/admin/cards/`

```
app/api/admin/cards/
  route.ts                    GET  list (with ?search=&section=&onlyOrphans=)
                              POST create
  [id]/
    route.ts                  GET  one
                              PATCH update
                              DELETE soft-delete
    bicolline-id/
      route.ts                PUT set bicollineId (admin only)
```

Each handler:
1. `const session = await getSession(); requireRole(session, ['admin','catalog_editor']);`
2. Parse + validate body (Zod-light: hand-rolled type guards are fine, the project doesn't use Zod today).
3. Call `lib/catalogue.ts`.
4. Return JSON `{ data, error }`.

`requireRole` helper goes in `lib/session.ts` next to `getSession`.

---

## 4. Page — `app/admin/cards/page.tsx` + `AdminCardsClient.tsx`

Server component (`page.tsx`) does the auth check + initial server fetch via the data layer (no round-trip to its own API):

```tsx
export default async function AdminCardsPage() {
  const session = await getSession();
  if (!session || !['admin','catalog_editor'].includes(session.role)) redirect('/');
  const cards = await listCards();
  const sections = await listSections();
  return <AdminCardsClient initialCards={cards} sections={sections} role={session.role} />;
}
```

Client component (`AdminCardsClient.tsx`) — table view with:
- **Filters bar:** search box (matches nameFr/nameEn), section dropdown, "Show only cards without bicollineId" toggle, "Show only orphans (no Item link)" toggle.
- **Table columns:** bicollineId · nameFr · nameEn · section · category · sortOrder · isActive · #ItemLinks · actions.
- **Inline edit:** click a row → side panel (Sheet) with all fields, including `bicollineId` (admin-only, locked for catalog_editor).
- **Bulk action (admin-only):** select rows, "Mark inactive" / "Reassign section."
- **Validation hints:** if you set a `bicollineId` already used by another row, the field turns red (server-side recheck on save).
- **"Used by production tree" badge:** if `bicollineId IS NOT NULL`, show a small badge linking to where the card appears in `buildings.json` (computed once on page load, no hot path).

Bilingual UI: French primary (matches the rest of the app), English labels in tooltips. Page title `Catalogue — Administration`.

---

## 5. Sidebar entry — `app/components/Sidebar.tsx`

Add a conditional entry, only when `role` allows:
```tsx
{ ['admin','catalog_editor'].includes(role) && (
  <SidebarLink href="/admin/cards">Catalogue (admin)</SidebarLink>
)}
```

---

## 6. Engine refactor — `lib/production-tree/engine.ts` (FOLLOW-UP, not in v1)

Today the engine uses `better-sqlite3` against the local `cards` table. Once `bicollineId` is backfilled, switch the engine's data source to Postgres CatalogueCard (joined on `bicollineId` → SQLite `building_inputs.input_card_id`). Two ways:

**Option E1 — Cache only.** Keep SQLite `cards` as a denormalized read cache, regenerated from CatalogueCard on app boot. Lowest risk; engine code unchanged.

**Option E2 — Direct.** Engine reads from PG via async. Requires every consumer (`/api/cards`, `/api/production-tree`, CardPicker) to handle Promises. Higher cost, cleaner long-term.

**Recommendation: ship E1 first** (one boot-time seed function in `db/index.ts`), do E2 in a separate PR after the admin page is in production for two weeks.

---

## 7. AuditLog wiring (confirmed schema)

PG table `AuditLog` has these columns (verified 2026-04-26):

| column      | type        | notes                                  |
|-------------|-------------|----------------------------------------|
| id          | text NOT NULL | cuid                                 |
| userId      | text NULL   | who did it (NULL for system jobs)     |
| action      | text NOT NULL | dot-namespaced, e.g. `catalogue.update`, `catalogue.set_bicolline_id` |
| targetType  | text NULL   | `'CatalogueCard'`                     |
| targetId    | text NULL   | the cuid of the affected row          |
| metadata    | jsonb NULL  | `{ before: {...}, after: {...}, fieldsChanged: [...] }` |
| createdAt   | timestamp   | default `CURRENT_TIMESTAMP`           |

Existing usage pattern (already in prod): `import.market_prices_workbook_manual`, `import.catalogue_cards`. Match the dot-namespacing.

Recommended action strings for /admin/cards:
- `catalogue.create`
- `catalogue.update`
- `catalogue.soft_delete`
- `catalogue.set_bicolline_id`

`metadata` shape for updates: `{ before: { ...row }, after: { ...row }, fieldsChanged: ["nameFr","section"] }`. For `set_bicolline_id`, also include `{ previousBicollineId: 12, newBicollineId: 17 }` for fast diffing.

---

## 8. File-by-file list (for your Monday morning)

NEW:
- `lib/catalogue.ts` — data layer (~250 lines)
- `lib/auth-helpers.ts` (or extend `lib/session.ts`) — `requireRole(session, allowed[])` (~20 lines)
- `app/api/admin/cards/route.ts` (~80 lines)
- `app/api/admin/cards/[id]/route.ts` (~80 lines)
- `app/api/admin/cards/[id]/bicolline-id/route.ts` (~40 lines)
- `app/admin/cards/page.tsx` (~30 lines)
- `app/admin/cards/AdminCardsClient.tsx` (~400 lines — the meat)
- `app/admin/layout.tsx` — extra admin shell + nav (~30 lines)

MODIFIED:
- `app/components/Sidebar.tsx` — conditional admin link
- `db/index.ts` — (Phase E1 only) read CatalogueCard at boot, refresh local `cards` table
- `lib/market-prices.ts` — switch its name-based join to `bicollineId` join (delete `MARKET_ITEM_ALIASES` map — it's now redundant)

DB:
- Already drafted: `db/migrations/2026-04-26_link_bicolline_id.sql` + `_backfill.sql`
- Plus a small follow-up: `ALTER TABLE "CatalogueCard" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE;`

---

## 9. Risks / things I want you to push back on

- **No tests in the repo today.** I'll be writing this without a safety net. At minimum I want to add a smoke script (like `scripts/smoke-production-tree.ts`) that hits `GET /api/admin/cards` and asserts row count.
- **Pool lifecycle.** `lib/market-prices.ts` has a circuit breaker for connection failures. The catalogue layer should reuse the same pool, not create a second one. Plan: extract pool into `lib/pg.ts`.
- **CSRF.** The mutation routes need a CSRF guard or SameSite=strict on the session cookie (currently `lax`). Recommend adding a simple double-submit token.
- **Race on bicollineId uniqueness.** Two admins editing two different rows to the same id within ms of each other would both pass client-side validation. The unique partial index catches it server-side; UI must surface the 409 cleanly.
- **What about the 5 inserted cards?** They get `bicollineId` set in the migration (5/23/114/145/147). They do NOT have Item links (no MarketPrice). Worth adding a "no Item link" badge so you know to wire them later if needed.

---

## 10. Order of operations (Monday)

1. **Run the migration on a Railway branch DB first**, not prod. Verify the `RAISE NOTICE` says `OK — matched=116, inserted=5, total_with_bicollineId=121`.
2. Inspect 3-5 rows by hand: `SELECT id, "nameFr", "bicollineId" FROM "CatalogueCard" WHERE "bicollineId" IN (5, 36, 47, 85, 153);`
3. If clean, run on prod.
4. Build `/admin/cards` (above).
5. Once shipped, switch `lib/market-prices.ts` to id-based join.
6. Two weeks later: engine refactor (Option E1 → eventually E2).
