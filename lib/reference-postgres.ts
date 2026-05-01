import { Pool } from "pg";
import { getServerConfig } from "./config";

export type Statut = "Confirmé" | "Extrait" | "À valider" | "Historique";

export interface Carte {
  id: string;
  nameFr: string;
  nameEn: string | null;
  famille: string;
  sousFamille: string | null;
  sphere: string | null;
  typeCarte: string | null;
  description: string | null;
  roleStrategique: string | null;
  estPhysique: boolean;
  notes: string | null;
  statut: Statut;
  sortOrder: number;
}

export interface Batiment {
  id: string;
  nameFr: string;
  sphere: string | null;
  capaciteQuantite: number | null;
  capaciteType: string | null;
  effetTexte: string | null;
  limitation: string | null;
  coutConstruction: string | null;
  pointsStructure: number | null;
  statut: Statut;
  sortOrder: number;
}

export interface Stade {
  id: string;
  nameFr: string;
  nombreMaxBatiments: number | null;
  coutsAugmentationText: string | null;
  statut: Statut;
  sortOrder: number;
}

export interface Cout {
  id: string;
  objetId: string;
  objetType: string;
  objetNom: string | null;
  typeCout: string | null;
  quantite: number | null;
  composant: string | null;
  texteSource: string | null;
  fragment: string | null;
  statut: Statut;
}

export interface Effet {
  id: string;
  sourceId: string;
  sourceType: string;
  sourceNom: string | null;
  cible: string | null;
  typeEffet: string | null;
  texte: string;
  valeurNum: number | null;
  duree: string | null;
  phase: string | null;
  condition: string | null;
  statut: Statut;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

let pool: Pool | null = null;
let poolUrl: string | null = null;
let circuitOpenedUntil = 0;
let consecutiveFailures = 0;

export class ReferenceDataError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ReferenceDataError";
  }
}

function getPool(): Pool {
  const config = getServerConfig();

  if (!config.marketDatabaseUrl) {
    throw new ReferenceDataError(
      "MARKET_DATABASE_URL (or DATABASE_URL) is not configured. Reference data lives in the shared Postgres — see Phase 2 plan."
    );
  }

  if (pool && poolUrl === config.marketDatabaseUrl) {
    return pool;
  }

  if (pool) {
    void pool.end().catch(() => undefined);
  }

  poolUrl = config.marketDatabaseUrl;
  pool = new Pool({
    connectionString: config.marketDatabaseUrl,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: config.marketDatabaseConnectionTimeoutMs,
    query_timeout: config.marketDatabaseQueryTimeoutMs,
    statement_timeout: config.marketDatabaseQueryTimeoutMs,
    ssl: config.marketDatabaseSsl ? { rejectUnauthorized: false } : false,
  });

  return pool;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const config = getServerConfig();

  if (Date.now() < circuitOpenedUntil) {
    throw new ReferenceDataError("Postgres circuit-breaker open (3 consecutive failures); paused 60s.");
  }

  let lastError: unknown = null;
  const db = getPool();

  for (let attempt = 0; attempt <= config.marketDatabaseRetryCount; attempt += 1) {
    try {
      const result = await db.query<T>(sql, params);
      consecutiveFailures = 0;
      circuitOpenedUntil = 0;
      return result.rows;
    } catch (error) {
      lastError = error;
      if (attempt < config.marketDatabaseRetryCount) {
        await sleep(150 * 2 ** attempt);
      }
    }
  }

  consecutiveFailures += 1;

  if (consecutiveFailures >= 3) {
    circuitOpenedUntil = Date.now() + 60000;
  }

  throw new ReferenceDataError("Postgres reference query failed after retries", lastError);
}

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;

  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.value;
  }

  const value = await loader();
  cache.set(key, { value, fetchedAt: Date.now() });

  return value;
}

export function _invalidateReferenceCache(): void {
  cache.clear();
}

const COMBINING_MARKS = /[̀-ͯ]/g;
const FANCY_APOSTROPHES = /[’ʼ‘`´]/g;
const HYPHEN_LIKE = /[-‐‑‒–—]/g;

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("fr-CA")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(FANCY_APOSTROPHES, "'")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(HYPHEN_LIKE, " ")
    .replace(/\s+/g, " ");
}

export function normalizeName(value: string): string {
  return normalize(value);
}

export function slugify(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ---------------------------------------------------------------------------
// Top-level loaders
// ---------------------------------------------------------------------------

export async function getCartes(): Promise<Carte[]> {
  return cached("cartes", async () => {
    const rows = await queryWithRetry<{
      id: string;
      nameFr: string;
      nameEn: string | null;
      famille: string;
      sousFamille: string | null;
      sphere: string | null;
      typeCarte: string | null;
      description: string | null;
      roleStrategique: string | null;
      estPhysique: boolean;
      notes: string | null;
      statut: string;
      sortOrder: number;
    }>(
      `SELECT id, "nameFr", "nameEn", famille, "sousFamille", sphere,
              "typeCarte", description, "roleStrategique", "estPhysique",
              notes, statut, "sortOrder"
       FROM "Carte"
       ORDER BY "sortOrder", "nameFr"`
    );

    return rows.map((r) => ({ ...r, statut: r.statut as Statut }));
  });
}

export async function getBatiments(): Promise<Batiment[]> {
  return cached("batiments", async () => {
    const rows = await queryWithRetry<{
      id: string;
      nameFr: string;
      sphere: string | null;
      capaciteQuantite: number | null;
      capaciteType: string | null;
      effetTexte: string | null;
      limitation: string | null;
      coutConstruction: string | null;
      pointsStructure: number | null;
      statut: string;
      sortOrder: number;
    }>(
      `SELECT id, "nameFr", sphere, "capaciteQuantite", "capaciteType",
              "effetTexte", limitation, "coutConstruction",
              "pointsStructure", statut, "sortOrder"
       FROM "Batiment"
       ORDER BY "sortOrder", "nameFr"`
    );

    return rows.map((r) => ({ ...r, statut: r.statut as Statut }));
  });
}

export async function getStades(): Promise<Stade[]> {
  return cached("stades", async () => {
    const rows = await queryWithRetry<{
      id: string;
      nameFr: string;
      nombreMaxBatiments: number | null;
      coutsAugmentationText: string | null;
      statut: string;
      sortOrder: number;
    }>(
      `SELECT id, "nameFr", "nombreMaxBatiments", "coutsAugmentationText",
              statut, "sortOrder"
       FROM "Stade"
       ORDER BY "sortOrder", "nameFr"`
    );
    return rows.map((r) => ({ ...r, statut: r.statut as Statut }));
  });
}

export async function getCouts(): Promise<Cout[]> {
  return cached("couts", async () => {
    const rows = await queryWithRetry<{
      id: string;
      objetId: string;
      objetType: string;
      objetNom: string | null;
      typeCout: string | null;
      quantite: string | null;
      composant: string | null;
      texteSource: string | null;
      fragment: string | null;
      statut: string;
    }>(
      `SELECT id, "objetId", "objetType", "objetNom", "typeCout",
              quantite, composant, "texteSource", fragment, statut
       FROM "Cout"`
    );

    return rows.map((r) => ({
      ...r,
      quantite: r.quantite === null ? null : Number(r.quantite),
      statut: r.statut as Statut,
    }));
  });
}

export async function getEffets(): Promise<Effet[]> {
  return cached("effets", async () => {
    const rows = await queryWithRetry<{
      id: string;
      sourceId: string;
      sourceType: string;
      sourceNom: string | null;
      cible: string | null;
      typeEffet: string | null;
      texte: string;
      valeurNum: string | null;
      duree: string | null;
      phase: string | null;
      condition: string | null;
      statut: string;
    }>(
      `SELECT id, "sourceId", "sourceType", "sourceNom", cible,
              "typeEffet", texte, "valeurNum", duree, phase, condition, statut
       FROM "Effet"`
    );

    return rows.map((r) => ({
      ...r,
      valeurNum: r.valeurNum === null ? null : Number(r.valeurNum),
      statut: r.statut as Statut,
    }));
  });
}

// ---------------------------------------------------------------------------
// Convenience derivations
// ---------------------------------------------------------------------------

export async function getCarteById(id: string): Promise<Carte | null> {
  const all = await getCartes();
  return all.find((c) => c.id === id) ?? null;
}

export async function getCarteByNameFr(name: string): Promise<Carte | null> {
  const target = normalize(name);
  const all = await getCartes();

  const exact = all.find((c) => normalize(c.nameFr) === target);
  if (exact) return exact;

  const stripped = target.endsWith("s") ? target.slice(0, -1) : target;

  return (
    all.find((c) => {
      const n = normalize(c.nameFr);
      return n === stripped || (n.endsWith("s") ? n.slice(0, -1) : n) === target;
    }) ?? null
  );
}

export async function getBatimentByNameFr(name: string): Promise<Batiment | null> {
  const target = normalize(name);
  const all = await getBatiments();

  return all.find((b) => normalize(b.nameFr) === target) ?? null;
}

export async function getBatimentById(id: string): Promise<Batiment | null> {
  const all = await getBatiments();
  return all.find((b) => b.id === id) ?? null;
}

export async function getCoutsForBatiment(batimentId: string, typeCout?: string): Promise<Cout[]> {
  const all = await getCouts();

  return all.filter(
    (c) =>
      c.objetType === "Bâtiment" &&
      c.objetId === batimentId &&
      (typeCout === undefined || c.typeCout === typeCout)
  );
}

export async function getEffetsForBatiment(batimentId: string): Promise<Effet[]> {
  const all = await getEffets();
  return all.filter((e) => e.sourceType === "Bâtiment" && e.sourceId === batimentId);
}

export async function getCoutsForStade(stadeId: string, typeCout?: string): Promise<Cout[]> {
  const all = await getCouts();

  return all.filter(
    (c) =>
      c.objetType === "Stade" &&
      c.objetId === stadeId &&
      (typeCout === undefined || c.typeCout === typeCout)
  );
}

export async function getBatimentSlugMapping(): Promise<Map<string, string>> {
  const batiments = await getBatiments();
  const map = new Map<string, string>();

  for (const b of batiments) {
    map.set(slugify(b.nameFr), b.id);
  }

  return map;
}

export async function getStadeIdFromLegacySlug(slug: string): Promise<string | null> {
  const stades = await getStades();
  const target = slugify(slug);

  // Phase 1 stages are prefixed with a sequence number: id="STADE_3_BOURGADE",
  // nameFr="3. Bourgade". Strip "N. " from name and "STADE_N_" from id before
  // matching against the legacy slug.
  for (const s of stades) {
    const nameStripped = s.nameFr.replace(/^\d+\.\s*/, "");
    if (slugify(nameStripped) === target) return s.id;
    const idSuffix = s.id.replace(/^STADE_\d+_/, "").toLowerCase();
    if (idSuffix === target) return s.id;
  }
  return null;
}