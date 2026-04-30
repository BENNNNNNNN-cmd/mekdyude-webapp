import { NextResponse } from "next/server";
import { listAllCards } from "@/lib/production-tree/engine";

/**
 * GET /api/cards
 * Returns all cards (id, title, category, substitutes), sorted by category then title.
 * Used by the production-tree CardPicker dropdown.
 */
export async function GET() {
  const cards = await listAllCards();
  return NextResponse.json(cards);
}
