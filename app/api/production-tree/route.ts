import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { expandForward } from "@/lib/production-tree/engine";

/**
 * GET /api/production-tree?card=36&substitutes=0&depth=6
 *
 * Returns the forward production tree rooted at the given card id.
 * Each card node lists every building consuming the card; under each
 * building, every output expands recursively (with cycle guards).
 *
 * Query params:
 *   - card        (required) card id to root the tree at
 *   - substitutes 0|1 — if 1, also follow substitute cards as input matches
 *   - depth       max recursion depth (default 6)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cardParam = searchParams.get("card");
  if (!cardParam) {
    return NextResponse.json({ error: "Missing required ?card=N" }, { status: 400 });
  }
  const cardId = Number(cardParam);
  if (!Number.isFinite(cardId)) {
    return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
  }

  const includeSubstitutes = searchParams.get("substitutes") === "1";
  const depthParam = searchParams.get("depth");
  const maxDepth = depthParam ? Math.max(1, Math.min(10, Number(depthParam))) : 6;

  const db = getDb();
  const tree = expandForward(db, cardId, { includeSubstitutes, maxDepth });
  if (!tree) {
    return NextResponse.json({ error: `Card ${cardId} not found` }, { status: 404 });
  }
  return NextResponse.json(tree);
}
