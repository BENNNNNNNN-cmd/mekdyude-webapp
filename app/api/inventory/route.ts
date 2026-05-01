import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getSession } from "@/lib/session";

function normalizeInventoryItemName(itemName: string) {
  return itemName.toLocaleLowerCase("fr-CA") === "solaris" ? "Solar" : itemName;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const items = db.prepare(`
    SELECT * FROM inventory WHERE guild_id = 'mek_dyude' ORDER BY category, item_name
  `).all() as Array<{ item_name: string }>;
  const normalizedItems = items.map((item) => ({
    ...item,
    item_name: normalizeInventoryItemName(item.item_name),
  }));
  return NextResponse.json(normalizedItems);
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { item_name, qty_coffre, qty_en_mains, notes } = body;

  if (!item_name) {
    return NextResponse.json({ error: "item_name required" }, { status: 400 });
  }

  const itemName = normalizeInventoryItemName(item_name);
  const db = getDb();
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (qty_coffre !== undefined) {
    updates.push("qty_coffre = ?");
    values.push(qty_coffre);
  }
  if (qty_en_mains !== undefined) {
    updates.push("qty_en_mains = ?");
    values.push(qty_en_mains);
  }
  if (notes !== undefined) {
    updates.push("notes = ?");
    values.push(notes);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push("mek_dyude", itemName);
  db.prepare(
    `UPDATE inventory SET ${updates.join(", ")} WHERE guild_id = ? AND item_name = ?`
  ).run(...values);

  const updated = db.prepare(
    "SELECT * FROM inventory WHERE guild_id = 'mek_dyude' AND item_name = ?"
  ).get(itemName);

  revalidatePath("/inventaire");

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { item_name } = body;

  if (!item_name) {
    return NextResponse.json({ error: "item_name required" }, { status: 400 });
  }

  const itemName = normalizeInventoryItemName(item_name);
  const db = getDb();
  const result = db
    .prepare("DELETE FROM inventory WHERE guild_id = ? AND item_name = ?")
    .run("mek_dyude", itemName);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  revalidatePath("/inventaire");

  return NextResponse.json({ ok: true });
}
