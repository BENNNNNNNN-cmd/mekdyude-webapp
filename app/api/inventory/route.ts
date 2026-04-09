import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const items = db.prepare(`
    SELECT * FROM inventory WHERE guild_id = 'mek_dyude' ORDER BY category, item_name
  `).all();
  return NextResponse.json(items);
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
  const { item_name, qty_coffre, qty_en_mains } = body;

  if (!item_name) {
    return NextResponse.json({ error: "item_name required" }, { status: 400 });
  }

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

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push("mek_dyude", item_name);
  db.prepare(
    `UPDATE inventory SET ${updates.join(", ")} WHERE guild_id = ? AND item_name = ?`
  ).run(...values);

  const updated = db.prepare(
    "SELECT * FROM inventory WHERE guild_id = 'mek_dyude' AND item_name = ?"
  ).get(item_name);

  revalidatePath("/inventaire");

  return NextResponse.json(updated);
}
