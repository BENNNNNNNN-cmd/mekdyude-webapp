import { NextResponse } from "next/server";
import { computeMaintenance } from "@/lib/maintenance";

export async function GET() {
  const maintenance = computeMaintenance();
  return NextResponse.json(maintenance);
}
