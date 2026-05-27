"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getSession } from "@/lib/session";
import {
  GUILD_ID,
  SEASON_OPTIONS,
  TRANSACTION_TYPES,
  TYPE_META,
  WRITABLE_TRANSACTION_TYPES,
  type CounterpartyType,
  type CreateTransactionInput,
  type LedgerActionResult,
  type LedgerTransaction,
  type SolarDirection,
  type TransactionType,
  type WritableTransactionType,
} from "./types";

const WRITABLE_TYPE_SET = new Set<string>(WRITABLE_TRANSACTION_TYPES);
const SEASON_SET = new Set(SEASON_OPTIONS.map((season) => season.value));
const COUNTERPARTY_TYPE_SET = new Set(["guild", "member", "external"]);

const MONTHS: Record<string, string> = {
  jan: "01",
  janvier: "01",
  fev: "02",
  fév: "02",
  fevr: "02",
  févr: "02",
  fevrier: "02",
  février: "02",
  mar: "03",
  mars: "03",
  avr: "04",
  avril: "04",
  mai: "05",
  jun: "06",
  juin: "06",
  jul: "07",
  juil: "07",
  juillet: "07",
  aout: "08",
  août: "08",
  sep: "09",
  sept: "09",
  septembre: "09",
  oct: "10",
  octobre: "10",
  nov: "11",
  novembre: "11",
  dec: "12",
  déc: "12",
  decembre: "12",
  décembre: "12",
};

type AuthResult =
  | { ok: true; username: string }
  | { ok: false; message: string };

interface InventoryRow {
  item_name: string;
  qty_coffre: number;
  category: string;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = normalizeText(value ?? "");
  return normalized.length > 0 ? normalized : null;
}

function parsePositiveInteger(value: number | string, label: string) {
  const parsed =
    typeof value === "number" ? value : Number(String(value).trim() || "0");

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false as const, message: `${label} doit être un entier plus grand que 0.` };
  }

  return { ok: true as const, value: parsed };
}

function parseNonNegativeInteger(value: number | string, label: string) {
  const parsed =
    typeof value === "number" ? value : Number(String(value).trim() || "0");

  if (!Number.isInteger(parsed) || parsed < 0) {
    return { ok: false as const, message: `${label} doit être un entier de 0 ou plus.` };
  }

  return { ok: true as const, value: parsed };
}

function parseLedgerDate(value: string) {
  const match = /^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})$/.exec(
    normalizeText(value)
  );
  if (!match) {
    return {
      ok: false as const,
      message: "La date doit être au format JJ MMM AAAA, par exemple 05 Sep 2026.",
    };
  }

  const day = Number(match[1]);
  const monthKey = match[2].replace(".", "").toLocaleLowerCase("fr-CA");
  const month = MONTHS[monthKey];
  const year = Number(match[3]);

  if (!month || day < 1 || day > 31 || year < 1900 || year > 2200) {
    return { ok: false as const, message: "La date d'inscription est invalide." };
  }

  const iso = `${year}-${month}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== day
  ) {
    return { ok: false as const, message: "La date d'inscription est invalide." };
  }

  return { ok: true as const, value: iso };
}

async function assertAdmin(actionLabel: string): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      message: `Session expirée. Reconnectez-vous avant de ${actionLabel}.`,
    };
  }
  if (session.role !== "admin") {
    return {
      ok: false,
      message: `Seuls les administrateurs peuvent ${actionLabel}.`,
    };
  }

  return { ok: true, username: session.username };
}

function revalidateLedgerPaths() {
  revalidatePath("/");
  revalidatePath("/inventaire");
  revalidatePath("/registre");
}

function findInventoryItem(itemName: string): InventoryRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT item_name, qty_coffre, category
       FROM inventory
       WHERE guild_id = ? AND lower(item_name) = lower(?)`
    )
    .get(GUILD_ID, itemName) as InventoryRow | undefined;
}

function applyInventoryDelta(itemName: string, delta: number): void {
  if (delta === 0) return;

  const db = getDb();
  const existing = findInventoryItem(itemName);

  if (!existing) {
    if (delta < 0) {
      throw new Error("stock_missing");
    }
    db.prepare(`
      INSERT INTO inventory (guild_id, item_name, category, qty_coffre, qty_en_mains, qty_production, notes)
      VALUES (?, ?, ?, ?, 0, 0, ?)
    `).run(GUILD_ID, itemName, "ressource", delta, null);
    return;
  }

  const nextQty = existing.qty_coffre + delta;
  if (nextQty < 0) {
    throw new Error("stock_insufficient");
  }

  db.prepare(
    "UPDATE inventory SET qty_coffre = ? WHERE guild_id = ? AND item_name = ?"
  ).run(nextQty, GUILD_ID, existing.item_name);
}

function resourceDelta(type: TransactionType, qty: number) {
  if (type === "correction") return 0;
  return TYPE_META[type].resourceDirection === "in" ? qty : -qty;
}

function solarDelta(direction: SolarDirection | null, qty: number) {
  if (!direction || qty === 0) return 0;
  return direction === "in" ? qty : -qty;
}

function applyTransactionEffects(
  transaction: Pick<
    LedgerTransaction,
    "type" | "resource_name" | "resource_qty" | "counter_solar" | "counter_solar_direction"
  >,
  multiplier = 1
) {
  applyInventoryDelta(
    transaction.resource_name,
    resourceDelta(transaction.type, transaction.resource_qty) * multiplier
  );
  applyInventoryDelta(
    "Solar",
    solarDelta(transaction.counter_solar_direction, transaction.counter_solar) *
      multiplier
  );
}

function resolveCounterparty(
  type: CounterpartyType,
  id: string | null,
  fallbackName: string
) {
  const db = getDb();
  if (type === "guild") {
    const row = db
      .prepare("SELECT id, name FROM guilds WHERE id = ?")
      .get(id) as { id: string; name: string } | undefined;
    if (!row) return { ok: false as const, message: "La guilde choisie est invalide." };
    return { ok: true as const, id: row.id, name: row.name };
  }

  if (type === "member") {
    const row = db
      .prepare(
        "SELECT id, character_name FROM clan_members WHERE guild_id = ? AND id = ?"
      )
      .get(GUILD_ID, id) as { id: string; character_name: string } | undefined;
    if (!row) return { ok: false as const, message: "Le membre choisi est invalide." };
    return { ok: true as const, id: row.id, name: row.character_name };
  }

  const name = normalizeText(fallbackName);
  if (!name) {
    return { ok: false as const, message: "Le nom de la contrepartie est requis." };
  }
  return { ok: true as const, id: null, name };
}

function selectTransaction(transactionId: number) {
  return getDb()
    .prepare("SELECT * FROM transactions WHERE guild_id = ? AND id = ?")
    .get(GUILD_ID, transactionId) as LedgerTransaction | undefined;
}

function insertCorrectionSibling(
  original: LedgerTransaction,
  username: string,
  note: string
) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const result = db
    .prepare(`
      INSERT INTO transactions (
        guild_id, type, status, date, season, counterparty_type, counterparty_id,
        counterparty_name, resource_name, resource_qty, counter_solar,
        counter_solar_direction, note, original_transaction_id, created_by
      )
      VALUES (?, 'correction', 'regle', ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, ?)
    `)
    .run(
      GUILD_ID,
      today,
      original.season,
      original.counterparty_type,
      original.counterparty_id,
      original.counterparty_name,
      original.resource_name,
      note,
      original.id,
      username
    );

  return Number(result.lastInsertRowid);
}

export async function createTransaction(
  input: CreateTransactionInput
): Promise<LedgerActionResult> {
  const auth = await assertAdmin("inscrire une transaction");
  if (!auth.ok) return { ok: false, message: auth.message };

  if (!WRITABLE_TYPE_SET.has(input.type)) {
    return { ok: false, message: "Le type de transaction est invalide." };
  }
  const type = input.type as WritableTransactionType;

  if (!SEASON_SET.has(input.season)) {
    return { ok: false, message: "La saison choisie est invalide." };
  }

  const parsedDate = parseLedgerDate(input.dateText);
  if (!parsedDate.ok) return { ok: false, message: parsedDate.message };

  const parsedQty = parsePositiveInteger(input.resourceQty, "La quantité");
  if (!parsedQty.ok) return { ok: false, message: parsedQty.message };

  if (!COUNTERPARTY_TYPE_SET.has(input.counterpartyType)) {
    return { ok: false, message: "Le type de contrepartie est invalide." };
  }
  const counterparty = resolveCounterparty(
    input.counterpartyType,
    input.counterpartyId,
    input.counterpartyName
  );
  if (!counterparty.ok) return { ok: false, message: counterparty.message };

  const resourceName = normalizeText(input.resourceName);
  const inventoryItem = findInventoryItem(resourceName);
  if (!inventoryItem) {
    return { ok: false, message: "La ressource choisie est introuvable." };
  }

  const isSolarResource =
    inventoryItem.item_name.toLocaleLowerCase("fr-CA") === "solar";
  const counterSolar = input.counterSolarEnabled && !isSolarResource
    ? parseNonNegativeInteger(input.counterSolar, "La contrepartie en Solar")
    : { ok: true as const, value: 0 };
  if (!counterSolar.ok) return { ok: false, message: counterSolar.message };

  const meta = TYPE_META[type];
  const counterSolarDirection =
    counterSolar.value > 0 ? meta.counterSolarDirection : null;
  const transaction = {
    type,
    resource_name: inventoryItem.item_name,
    resource_qty: parsedQty.value,
    counter_solar: counterSolar.value,
    counter_solar_direction: counterSolarDirection,
  };

  try {
    const db = getDb();
    const save = db.transaction(() => {
      applyTransactionEffects(transaction);

      const result = db
        .prepare(`
          INSERT INTO transactions (
            guild_id, type, status, date, season, counterparty_type,
            counterparty_id, counterparty_name, resource_name, resource_qty,
            counter_solar, counter_solar_direction, note, created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          GUILD_ID,
          type,
          meta.initialStatus,
          parsedDate.value,
          input.season,
          input.counterpartyType,
          counterparty.id,
          counterparty.name,
          inventoryItem.item_name,
          parsedQty.value,
          counterSolar.value,
          counterSolarDirection,
          normalizeOptional(input.note),
          auth.username
        );

      return Number(result.lastInsertRowid);
    });

    const transactionId = save();
    revalidateLedgerPaths();
    return {
      ok: true,
      transactionId,
      sealedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof Error && err.message === "stock_insufficient") {
      return { ok: false, message: "Stock insuffisant dans le coffre." };
    }
    return { ok: false, message: "Impossible d'inscrire la transaction." };
  }
}

export async function settleTransaction(
  transactionId: number
): Promise<LedgerActionResult> {
  const auth = await assertAdmin("régler une transaction");
  if (!auth.ok) return { ok: false, message: auth.message };

  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return { ok: false, message: "La transaction est invalide." };
  }

  const transaction = selectTransaction(transactionId);
  if (!transaction) return { ok: false, message: "Cette transaction n'existe plus." };
  if (transaction.status !== "actif") {
    return { ok: false, message: "Seules les transactions actives peuvent être réglées." };
  }

  try {
    const db = getDb();
    // Régler referme l'échange: on inverse le mouvement initial (le prêt
    // revient au coffre, la garantie de location est rendue, etc.).
    const settle = db.transaction(() => {
      applyTransactionEffects(transaction, -1);
      db.prepare(
        "UPDATE transactions SET status = 'regle' WHERE guild_id = ? AND id = ?"
      ).run(GUILD_ID, transactionId);
    });

    settle();
    revalidateLedgerPaths();
    return { ok: true, transactionId };
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === "stock_insufficient" || err.message === "stock_missing")
    ) {
      return {
        ok: false,
        message:
          "Règlement bloqué: le coffre ne contient plus assez de stock pour refermer l'inscription.",
      };
    }
    return { ok: false, message: "Impossible de régler cette transaction." };
  }
}

export async function cancelTransaction(
  transactionId: number,
  reason: string
): Promise<LedgerActionResult> {
  const auth = await assertAdmin("annuler une transaction");
  if (!auth.ok) return { ok: false, message: auth.message };

  const normalizedReason = normalizeOptional(reason);
  if (!normalizedReason) {
    return { ok: false, message: "Un motif d'annulation est requis." };
  }

  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return { ok: false, message: "La transaction est invalide." };
  }

  const transaction = selectTransaction(transactionId);
  if (!transaction) return { ok: false, message: "Cette transaction n'existe plus." };
  if (transaction.type === "correction") {
    return { ok: false, message: "Une correction est déjà une trace d'audit." };
  }
  if (transaction.status === "annule") {
    return { ok: false, message: "Cette transaction est déjà annulée." };
  }

  try {
    const db = getDb();
    const cancel = db.transaction(() => {
      // Si la transaction est déjà réglée, son effet initial a déjà été
      // inversé par le règlement — ne pas rembourser une seconde fois.
      const effectAlreadyReversed =
        transaction.status === "regle" &&
        TYPE_META[transaction.type].initialStatus === "actif";
      if (!effectAlreadyReversed) {
        applyTransactionEffects(transaction, -1);
      }
      db.prepare(`
        UPDATE transactions
        SET status = 'annule',
            cancelled_at = datetime('now'),
            cancelled_by = ?,
            cancellation_reason = ?
        WHERE guild_id = ? AND id = ?
      `).run(auth.username, normalizedReason, GUILD_ID, transactionId);

      return insertCorrectionSibling(
        transaction,
        auth.username,
        `Annulation de l'inscription #${transaction.id}: ${normalizedReason}`
      );
    });

    const correctionId = cancel();
    revalidateLedgerPaths();
    return { ok: true, transactionId: correctionId };
  } catch (err) {
    if (err instanceof Error && err.message === "stock_insufficient") {
      return {
        ok: false,
        message:
          "Annulation bloquée: le coffre ne contient plus assez de stock pour inverser l'inscription.",
      };
    }
    return { ok: false, message: "Impossible d'annuler cette transaction." };
  }
}

export async function createCorrectionTransaction(
  transactionId: number,
  note: string
): Promise<LedgerActionResult> {
  const auth = await assertAdmin("corriger une transaction");
  if (!auth.ok) return { ok: false, message: auth.message };

  const normalizedNote = normalizeOptional(note);
  if (!normalizedNote) {
    return { ok: false, message: "Une note de correction est requise." };
  }

  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    return { ok: false, message: "La transaction est invalide." };
  }

  const transaction = selectTransaction(transactionId);
  if (!transaction) return { ok: false, message: "Cette transaction n'existe plus." };

  try {
    const correctionId = insertCorrectionSibling(
      transaction,
      auth.username,
      `Correction de l'inscription #${transaction.id}: ${normalizedNote}`
    );
    revalidateLedgerPaths();
    return { ok: true, transactionId: correctionId };
  } catch {
    return { ok: false, message: "Impossible de corriger cette transaction." };
  }
}
