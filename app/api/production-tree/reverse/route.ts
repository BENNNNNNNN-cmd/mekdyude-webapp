import { NextRequest, NextResponse } from "next/server";
import { computeReversePlan } from "@/lib/production-tree/reverse-options";

const DEFAULT_GUILD_ID = "mek_dyude";

/**
 * GET /api/production-tree/reverse?card=CARTE_*&qty=50&guild=mek_dyude
 *
 * Returns a ranked plan for hitting `qty` of card `card` per year, given the
 * guild's current state (production, domains, inventory, slots).
 *
 * Query params:
 *   - card  (required) target card id (CARTE_*)
 *   - qty   (required) needed quantity per year
 *   - guild (optional) defaults to mek_dyude
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cardId = searchParams.get("card");
  const qtyParam = searchParams.get("qty");

  if (!cardId || !qtyParam) {
    return NextResponse.json({ error: "Missing required ?card=CARTE_*&qty=N" }, { status: 400 });
  }

  const qty = Number(qtyParam);
  if (!Number.isFinite(qty) || qty < 0) {
    return NextResponse.json({ error: "Invalid qty" }, { status: 400 });
  }

  const guildId = searchParams.get("guild") ?? DEFAULT_GUILD_ID;
  const plan = await computeReversePlan(cardId, qty, guildId);
  if (!plan) {
    return NextResponse.json({ error: `Card ${cardId} not found` }, { status: 404 });
  }
  return NextResponse.json(plan);
}
