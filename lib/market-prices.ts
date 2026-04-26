import { Pool } from "pg";
import { getServerConfig } from "@/lib/config";

export interface MarketPriceSummary {
  marketItemName: string;
  lowPrice: number;
  averagePrice: number;
  highPrice: number;
  cheapestMarketCode: string;
  cheapestMarketName: string;
  cheapestPrice: number;
  cheapestQtyPerLot: number;
  latestSourceDate: string | null;
}

interface MarketPriceRow {
  inventoryName: string;
  marketItemName: string;
  comptoirCode: string;
  comptoirName: string;
  sellPrice: number;
  qtyPerLot: number;
  sourceDate: Date | string | null;
}

interface CandidateName {
  requested_name: string;
  market_name: string;
}

const MARKET_ITEM_ALIASES: Record<string, string[]> = {
  "composante surnaturelles": ["composante generique", "composante générique"],
  "inf. empire": ["influences empire"],
  "inf. irendille": ["influences irendille"],
  "inf. terre des brumes": ["influences terres des brumes"],
  "min. argent": ["minerai d'argent"],
  "minerais or": ["minerai d'or"],
  "mentor mil.": ["mentor militaire"],
  "objet de coll.": ["objet de collection"],
  solaris: ["solar"],
  "sold. de metier": ["soldat de métier"],
  "sold. de métier": ["soldat de métier"],
};

let pool: Pool | null = null;
let poolUrl: string | null = null;
let circuitOpenedUntil = 0;
let consecutiveFailures = 0;

function normalizeKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("fr-CA")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeMarketName(value: string) {
  return value.trim().toLocaleLowerCase("fr-CA").replace(/\s+/g, " ");
}

function getPool() {
  const config = getServerConfig();
  if (!config.marketDatabaseUrl) return null;

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

function buildCandidateNames(itemNames: string[]) {
  const candidates: CandidateName[] = [];
  const seen = new Set<string>();

  for (const itemName of itemNames) {
    const normalized = normalizeMarketName(itemName);
    const aliases = MARKET_ITEM_ALIASES[normalizeKey(itemName)] ?? [];
    const names = [normalized, ...aliases];

    if (normalized.endsWith("s")) {
      names.push(normalized.slice(0, -1));
    }

    for (const name of names) {
      const marketName = normalizeMarketName(name);
      const key = `${itemName}\u0000${marketName}`;
      if (!seen.has(key)) {
        candidates.push({ requested_name: itemName, market_name: marketName });
        seen.add(key);
      }
    }
  }

  return candidates;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryMarketRows(db: Pool, candidates: CandidateName[]) {
  const result = await db.query<MarketPriceRow>(
    `
      WITH candidate_names AS (
        SELECT DISTINCT requested_name, market_name
        FROM jsonb_to_recordset($1::jsonb) AS candidate(requested_name text, market_name text)
      ),
      matched_items AS (
        SELECT candidate_names.requested_name, item.id, item."nameFr"
        FROM candidate_names
        JOIN "Item" item ON lower(item."nameFr") = candidate_names.market_name
        WHERE item."isActive" = true
      ),
      latest_prices AS (
        SELECT DISTINCT ON (
          market_price."itemId",
          market_price."comptoirId",
          COALESCE(market_price."qtyPerLot", 1)
        )
          market_price."itemId",
          market_price."comptoirId",
          market_price."sellPrice",
          market_price."sourceDate",
          COALESCE(market_price."qtyPerLot", 1) AS "qtyPerLot"
        FROM "MarketPrice" market_price
        JOIN (SELECT DISTINCT id FROM matched_items) item_ids ON item_ids.id = market_price."itemId"
        ORDER BY
          market_price."itemId",
          market_price."comptoirId",
          COALESCE(market_price."qtyPerLot", 1),
          market_price."sourceDate" DESC
      )
      SELECT
        matched_items.requested_name AS "inventoryName",
        matched_items."nameFr" AS "marketItemName",
        comptoir.code AS "comptoirCode",
        comptoir.name AS "comptoirName",
        latest_prices."sellPrice" AS "sellPrice",
        latest_prices."qtyPerLot" AS "qtyPerLot",
        latest_prices."sourceDate" AS "sourceDate"
      FROM matched_items
      JOIN latest_prices ON latest_prices."itemId" = matched_items.id
      JOIN "Comptoir" comptoir ON comptoir.id = latest_prices."comptoirId"
      WHERE latest_prices."sellPrice" IS NOT NULL
        AND latest_prices."sellPrice" > 0
        AND comptoir."isActive" = true
      ORDER BY matched_items.requested_name, latest_prices."sellPrice", comptoir.code
    `,
    [JSON.stringify(candidates)]
  );

  return result.rows;
}

async function queryWithRetry(db: Pool, candidates: CandidateName[]) {
  const config = getServerConfig();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= config.marketDatabaseRetryCount; attempt += 1) {
    try {
      return await queryMarketRows(db, candidates);
    } catch (error) {
      lastError = error;
      if (attempt < config.marketDatabaseRetryCount) {
        await sleep(150 * 2 ** attempt);
      }
    }
  }

  throw lastError;
}

function recordSuccess() {
  consecutiveFailures = 0;
  circuitOpenedUntil = 0;
}

function recordFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= 3) {
    circuitOpenedUntil = Date.now() + 60000;
  }
}

function getSourceDateValue(sourceDate: Date | string | null) {
  if (!sourceDate) return null;
  if (sourceDate instanceof Date) return sourceDate.getTime();

  const value = new Date(sourceDate).getTime();
  return Number.isFinite(value) ? value : null;
}

function formatSourceDate(sourceDate: Date | string | null) {
  const value = getSourceDateValue(sourceDate);
  if (value === null) return null;

  return new Date(value).toISOString();
}

function summarizeRows(rows: MarketPriceRow[]) {
  const grouped = new Map<string, MarketPriceRow[]>();

  for (const row of rows) {
    const sellPrice = Number(row.sellPrice);
    const qtyPerLot = Number(row.qtyPerLot);
    if (!Number.isFinite(sellPrice) || sellPrice <= 0) continue;

    const normalizedRow = {
      ...row,
      sellPrice,
      qtyPerLot: Number.isFinite(qtyPerLot) && qtyPerLot > 0 ? qtyPerLot : 1,
    };

    const group = grouped.get(row.inventoryName) ?? [];
    group.push(normalizedRow);
    grouped.set(row.inventoryName, group);
  }

  const summaries = new Map<string, MarketPriceSummary>();

  for (const [inventoryName, group] of grouped) {
    if (group.length === 0) continue;

    const prices = group.map((row) => row.sellPrice);
    const cheapest = [...group].sort((a, b) => {
      if (a.sellPrice !== b.sellPrice) return a.sellPrice - b.sellPrice;

      const bDate = getSourceDateValue(b.sourceDate) ?? 0;
      const aDate = getSourceDateValue(a.sourceDate) ?? 0;
      if (bDate !== aDate) return bDate - aDate;

      return a.comptoirCode.localeCompare(b.comptoirCode, "fr-CA");
    })[0];
    const latestSourceDate = group.reduce<Date | string | null>((latest, row) => {
      const latestValue = getSourceDateValue(latest) ?? 0;
      const rowValue = getSourceDateValue(row.sourceDate) ?? 0;
      return rowValue > latestValue ? row.sourceDate : latest;
    }, null);

    summaries.set(inventoryName, {
      marketItemName: cheapest.marketItemName,
      lowPrice: Math.min(...prices),
      averagePrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
      highPrice: Math.max(...prices),
      cheapestMarketCode: cheapest.comptoirCode,
      cheapestMarketName: cheapest.comptoirName,
      cheapestPrice: cheapest.sellPrice,
      cheapestQtyPerLot: cheapest.qtyPerLot,
      latestSourceDate: formatSourceDate(latestSourceDate),
    });
  }

  return summaries;
}

export async function getMarketPriceSummaries(itemNames: string[]) {
  if (itemNames.length === 0 || Date.now() < circuitOpenedUntil) {
    return new Map<string, MarketPriceSummary>();
  }

  const db = getPool();
  if (!db) {
    return new Map<string, MarketPriceSummary>();
  }

  const candidates = buildCandidateNames(itemNames);
  if (candidates.length === 0) {
    return new Map<string, MarketPriceSummary>();
  }

  try {
    const rows = await queryWithRetry(db, candidates);
    recordSuccess();
    return summarizeRows(rows);
  } catch {
    recordFailure();
    return new Map<string, MarketPriceSummary>();
  }
}
