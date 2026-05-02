import { NextRequest, NextResponse } from "next/server";
import { expandForward } from "@/lib/production-tree/engine";
import { annotateForward } from "@/lib/production-tree/overlay";

const DEFAULT_GUILD_ID = "mek_dyude";
const DEFAULT_MAX_DEPTH = 6;

function parseMaxDepth(value: string | null) {
  if (!value) return DEFAULT_MAX_DEPTH;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_DEPTH;
  return Math.max(1, Math.min(10, Math.trunc(parsed)));
}

function logRouteIssue(
  level: "warn" | "error",
  message: string,
  status: number,
  latencyMs: number,
  correlationId: string
) {
  console[level](`[production-tree] ${message}`, {
    status,
    latencyMs,
    correlationId,
  });
}

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
  const startedAt = Date.now();
  const correlationId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const { searchParams } = new URL(request.url);
  const cardId = searchParams.get("card");
  if (!cardId) {
    return NextResponse.json({ error: "Missing required ?card=CARTE_*" }, { status: 400 });
  }

  const includeSubstitutes = searchParams.get("substitutes") === "1";
  const maxDepth = parseMaxDepth(searchParams.get("depth"));
  const overlay = searchParams.get("overlay") !== "0";
  const guildId = searchParams.get("guild") ?? DEFAULT_GUILD_ID;

  try {
    const tree = await expandForward(cardId, { includeSubstitutes, maxDepth });
    if (!tree) {
      return NextResponse.json({ error: `Card ${cardId} not found` }, { status: 404 });
    }

    if (overlay) {
      try {
        await annotateForward(tree, guildId);
        const response = NextResponse.json(tree);
        response.headers.set("x-production-tree-overlay", "ok");
        return response;
      } catch {
        logRouteIssue(
          "warn",
          "overlay fallback",
          200,
          Date.now() - startedAt,
          correlationId
        );
        const response = NextResponse.json(tree);
        response.headers.set("x-production-tree-overlay", "fallback");
        return response;
      }
    }

    const response = NextResponse.json(tree);
    response.headers.set("x-production-tree-overlay", "disabled");
    return response;
  } catch {
    logRouteIssue(
      "error",
      "request failed",
      500,
      Date.now() - startedAt,
      correlationId
    );
    return NextResponse.json(
      {
        error: "Impossible de charger l'arbre de production.",
        correlationId,
      },
      { status: 500 }
    );
  }
}
