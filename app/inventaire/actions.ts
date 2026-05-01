"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getSession } from "@/lib/session";

const GUILD_ID = "mek_dyude";
const INVENTORY_CATEGORIES = ["ressource", "unite", "objet", "influence"] as const;

type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];
type SolarTarget = "qty_coffre" | "qty_en_mains";

interface InventoryActionItem {
  id: number;
  item_name: string;
  category: string;
  qty_coffre: number;
  qty_en_mains: number;
  qty_production: number;
  notes: string | null;
}

type InventoryActionResult =
  | { ok: true; item: InventoryActionItem }
  | { ok: false; message: string };

interface CreateInventoryItemInput {
  item_name: string;
  category: string;
  qty_coffre: string | number;
  qty_en_mains: string | number;
  qty_production: string | number;
  notes: string | null;
}

interface AddSolarsInput {
  amount: string | number;
  target: SolarTarget;
}

async function assertAdmin(actionLabel: string) {
  const session = await getSession();
  if (!session) {
    return "Session expirée. Reconnectez-vous avant de continuer.";
  }
  if (session.role !== "admin") {
    return `Seuls les administrateurs peuvent ${actionLabel}.`;
  }

  return null;
}

function normalizeRequiredText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeOptionalText(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeCategory(value: string): InventoryCategory | null {
  return INVENTORY_CATEGORIES.includes(value as InventoryCategory)
    ? (value as InventoryCategory)
    : null;
}

function parseWholeQuantity(value: string | number, label: string) {
  const parsed =
    typeof value === "number" ? value : Number(value.trim() || "0");

  if (!Number.isInteger(parsed) || parsed < 0) {
    return { ok: false as const, message: `${label} doit être un nombre entier de 0 ou plus.` };
  }

  return { ok: true as const, value: parsed };
}

function selectInventoryItem(itemName: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM inventory WHERE guild_id = ? AND item_name = ?")
    .get(GUILD_ID, itemName) as InventoryActionItem | undefined;
}

export async function createInventoryItem(
  input: CreateInventoryItemInput
): Promise<InventoryActionResult> {
  const authError = await assertAdmin("ajouter un item à l'inventaire");
  if (authError) return { ok: false, message: authError };

  const itemName = normalizeRequiredText(input.item_name);
  const category = normalizeCategory(input.category);
  const notes = normalizeOptionalText(input.notes);

  if (!itemName) {
    return { ok: false, message: "Le nom de l'item est requis." };
  }
  if (!category) {
    return { ok: false, message: "La section choisie est invalide." };
  }

  const qtyCoffre = parseWholeQuantity(input.qty_coffre, "Coffre");
  const qtyEnMains = parseWholeQuantity(input.qty_en_mains, "En mains");
  const qtyProduction = parseWholeQuantity(input.qty_production, "Production");

  if (!qtyCoffre.ok) return { ok: false, message: qtyCoffre.message };
  if (!qtyEnMains.ok) return { ok: false, message: qtyEnMains.message };
  if (!qtyProduction.ok) return { ok: false, message: qtyProduction.message };

  const db = getDb();
  const existing = db
    .prepare("SELECT item_name FROM inventory WHERE guild_id = ? AND lower(item_name) = lower(?)")
    .get(GUILD_ID, itemName) as { item_name: string } | undefined;

  if (existing) {
    return {
      ok: false,
      message: `${existing.item_name} existe déjà dans l'inventaire.`,
    };
  }

  try {
    db.prepare(`
      INSERT INTO inventory (guild_id, item_name, category, qty_coffre, qty_en_mains, qty_production, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      GUILD_ID,
      itemName,
      category,
      qtyCoffre.value,
      qtyEnMains.value,
      qtyProduction.value,
      notes
    );

    const item = selectInventoryItem(itemName);
    if (!item) {
      return { ok: false, message: "Impossible de relire l'item ajouté." };
    }

    revalidatePath("/inventaire");
    return { ok: true, item };
  } catch {
    return { ok: false, message: "Impossible d'ajouter l'item à l'inventaire." };
  }
}

export async function addSolars(input: AddSolarsInput): Promise<InventoryActionResult> {
  const authError = await assertAdmin("ajouter des solars");
  if (authError) return { ok: false, message: authError };

  const amount = parseWholeQuantity(input.amount, "Montant");
  if (!amount.ok) return { ok: false, message: amount.message };
  if (amount.value === 0) {
    return { ok: false, message: "Le montant de solars doit être plus grand que 0." };
  }

  const target = input.target === "qty_en_mains" ? "qty_en_mains" : "qty_coffre";
  const db = getDb();

  try {
    const saveSolars = db.transaction(() => {
      const existing = db
        .prepare("SELECT item_name FROM inventory WHERE guild_id = ? AND lower(item_name) = 'solar'")
        .get(GUILD_ID) as { item_name: string } | undefined;

      if (existing) {
        db.prepare(`UPDATE inventory SET ${target} = ${target} + ? WHERE guild_id = ? AND item_name = ?`)
          .run(amount.value, GUILD_ID, existing.item_name);
        return existing.item_name;
      }

      db.prepare(`
        INSERT INTO inventory (guild_id, item_name, category, qty_coffre, qty_en_mains, qty_production, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        GUILD_ID,
        "solar",
        "ressource",
        target === "qty_coffre" ? amount.value : 0,
        target === "qty_en_mains" ? amount.value : 0,
        0,
        null
      );

      return "solar";
    });

    const itemName = saveSolars();
    const item = selectInventoryItem(itemName);
    if (!item) {
      return { ok: false, message: "Impossible de relire les solars ajoutés." };
    }

    revalidatePath("/");
    revalidatePath("/inventaire");
    return { ok: true, item };
  } catch {
    return { ok: false, message: "Impossible d'ajouter les solars." };
  }
}
