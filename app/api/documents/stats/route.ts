import { NextResponse } from "next/server";
import { getDocumentStats } from "@/lib/documents";

export async function GET() {
  const stats = getDocumentStats();
  return NextResponse.json(stats);
}
