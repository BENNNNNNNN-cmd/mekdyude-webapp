import { NextResponse } from "next/server";
import { ensureReferenceMigration } from "@/db";
import { computeMaintenance } from "@/lib/maintenance";

export async function GET() {
  await ensureReferenceMigration();
  const maintenance = await computeMaintenance();
  return NextResponse.json(maintenance);
}
