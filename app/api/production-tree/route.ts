import { NextRequest, NextResponse } from "next/server";
import { expandForward } from "@/lib/production-tree/engine";
import { annotateForward } from "@/lib/production-tree/overlay";

const DEFAULT_GUILD_ID = "mek_dyude";

/**
 * GET /api/production-tree?card=CARTE_PAYSAN&substitutes=0&depth=6&overlay=1&guild=mek_dyude
 *
 * Returns the forward production tree rooted at the given card id.
 * Each card node lists every building consuming the card; under each
 * building, every output expands recursively (with cycle guards).
 *
 * Query params:
 *   - card        (required) Carte id (CARTE_*) to root the tree at
 *   - substitutes 0|1 — also follow substitute cards as input matches
 *   - depth       max recursion depth (default 6)
 *   - overlay     0|1 — annotate buildings with built/buildable/blocked
 *                 status against the guild's domains (default 1)
 *   - guild       guild id (default "mek_dyude")
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cardId = searchParams.get("card");
  if (!cardId) {
    return NextResponse.json({ error: "Missing required ?card=CARTE_*" }, { status: 400 });
  }

  const includeSubstitutes = searchParams.get("substitutes") === "1";
  const depthParam = searchParams.get("depth");
  const maxDepth = depthParam ? Math.max(1, Math.min(10, Number(depthParam))) : 6;
  const overlay = searchParams.get("overlay") !== "0";
  const guildId = searchParams.get("guild") ?? DEFAULT_GUILD_ID;

  const tree = await expandForward(cardId, { includeSubstitutes, maxDepth });
  if (!tree) {
    return NextResponse.json({ error: `Card ${cardId} not found` }, { status: 404 });
  }
  if (overlay) await annotateForward(tree, guildId);
  return NextResponse.json(tree);
}
