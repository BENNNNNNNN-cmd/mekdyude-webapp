import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { computeReversePlan } from "@/lib/production-tree/reverse-options";

const DEFAULT_GUILD_ID = "mek_dyude";

/**
 * GET /api/production-tree/reverse?card=54&qty=50&guild=mek_dyude
 *
 * Returns a ranked plan for hitting `qty` of card `card` per year, given the
 * guild's current state (production, domains, inventory, slots).
 *
 * Query params:
 *   - card  (required) target card id
 *   - qty   (required) needed quantity per year
 *   - guild (optional) defaults to mek_dyude
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cardParam = searchParams.get("card");
  const qtyParam = searchParams.get("qty");

  if (!cardParam || !qtyParam) {
    return NextResponse.json(
      { error: "Missing required ?card=N&qty=N" },
      { status: 400 }
    );
  }

  const cardId = Number(cardParam);
  const qty = Number(qtyParam);
  if (!Number.isFinite(cardId) || !Number.isFinite(qty) || qty < 0) {
    return NextResponse.json(
      { error: "Invalid card or qty" },
      { status: 400 }
    );
  }

  const guildId = searchParams.get("guild") ?? DEFAULT_GUILD_ID;

  const db = getDb();
  const plan = computeReversePlan(db, cardId, qty, guildId);
  if (!plan) {
    return NextResponse.json(
      { error: `Card ${cardId} not found` },
      { status: 404 }
    );
  }
  return NextResponse.json(plan);
}
