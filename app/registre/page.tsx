import { connection } from "next/server";
import { getDb } from "@/db";
import { getSession } from "@/lib/session";
import RegistreClient from "./RegistreClient";
import {
  GUILD_ID,
  SEASON_OPTIONS,
  type CounterpartyOption,
  type InventoryOption,
  type LedgerTransaction,
} from "./types";

export const dynamic = "force-dynamic";

function currentSeasonValue(date = new Date()) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 3 && month <= 5) return `printemps_${year}`;
  if (month >= 6 && month <= 8) return `ete_${year}`;
  if (month >= 9 && month <= 11) return `automne_${year}`;
  return `hiver_${month === 12 ? year + 1 : year}`;
}

function seasonLabel(value: string) {
  return SEASON_OPTIONS.find((season) => season.value === value)?.label ?? value;
}

function normalizeInventoryName(itemName: string) {
  return itemName.toLocaleLowerCase("fr-CA") === "solaris" ? "Solar" : itemName;
}

export default async function RegistrePage() {
  await connection();

  const db = getDb();
  const session = await getSession();
  const currentSeason = currentSeasonValue();

  const transactions = db
    .prepare(
      `SELECT *
       FROM transactions
       WHERE guild_id = ?
       ORDER BY date DESC, sealed_at DESC, id DESC
       LIMIT 200`
    )
    .all(GUILD_ID) as LedgerTransaction[];

  const guildRows = db
    .prepare("SELECT id, name FROM guilds ORDER BY name")
    .all() as Array<{ id: string; name: string }>;

  const memberRows = db
    .prepare(
      `SELECT id, character_name
       FROM clan_members
       WHERE guild_id = ?
       ORDER BY sort_order, character_name`
    )
    .all(GUILD_ID) as Array<{ id: string; character_name: string }>;

  const inventoryRows = db
    .prepare(
      `SELECT id, item_name, category, qty_coffre
       FROM inventory
       WHERE guild_id = ?
         AND category IN ('ressource', 'objet')
       ORDER BY category, item_name`
    )
    .all(GUILD_ID) as Array<{
    id: number;
    item_name: string;
    category: string;
    qty_coffre: number;
  }>;

  const solarRow = db
    .prepare(
      `SELECT id, item_name, category, qty_coffre
       FROM inventory
       WHERE guild_id = ? AND lower(item_name) = 'solar'`
    )
    .get(GUILD_ID) as
    | { id: number; item_name: string; category: string; qty_coffre: number }
    | undefined;

  const inventoryByName = new Map<string, InventoryOption>();
  for (const row of inventoryRows) {
    const name = normalizeInventoryName(row.item_name);
    inventoryByName.set(name.toLocaleLowerCase("fr-CA"), {
      id: row.id,
      name,
      category: row.category,
      stock: row.qty_coffre,
    });
  }
  if (solarRow) {
    inventoryByName.set("solar", {
      id: solarRow.id,
      name: "Solar",
      category: solarRow.category,
      stock: solarRow.qty_coffre,
    });
  }

  const counterparties: CounterpartyOption[] = [
    ...guildRows.map((guild) => ({
      type: "guild" as const,
      id: guild.id,
      name: guild.name,
    })),
    ...memberRows.map((member) => ({
      type: "member" as const,
      id: member.id,
      name: member.character_name,
    })),
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      <RegistreClient
        initialTransactions={transactions}
        counterparties={counterparties}
        inventory={Array.from(inventoryByName.values())}
        currentUser={session?.username ?? "Registre"}
        canWrite={session?.role === "admin"}
        seasonLabel={seasonLabel(currentSeason)}
        defaultSeason={SEASON_OPTIONS.some((season) => season.value === currentSeason)
          ? currentSeason
          : "automne_2026"}
      />
    </div>
  );
}
