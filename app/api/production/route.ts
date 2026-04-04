import { NextResponse } from "next/server";
import { getProductionSummary } from "@/lib/production";

export async function GET() {
  const summary = getProductionSummary();
  return NextResponse.json(summary);
}
