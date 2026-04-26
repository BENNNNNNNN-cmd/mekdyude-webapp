import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { listAllCards } from "@/lib/production-tree/engine";

/**
 * GET /api/cards
 * Returns all cards (id, title, category, substitutes), sorted by category then title.
 * Used by the production-tree CardPicker dropdown.
 */
export async function GET() {
  const db = getDb();
  const cards = listAllCards(db);
  return NextResponse.json(cards);
}
