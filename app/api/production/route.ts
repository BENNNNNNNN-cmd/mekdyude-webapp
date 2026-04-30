import { NextResponse } from "next/server";
import { ensureReferenceMigration } from "@/db";
import { getProductionSummary } from "@/lib/production";

export async function GET() {
  await ensureReferenceMigration();
  const summary = await getProductionSummary();
  return NextResponse.json(summary);
}
