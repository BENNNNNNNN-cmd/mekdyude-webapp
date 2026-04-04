import { NextRequest, NextResponse } from "next/server";
import { checkConstructionFeasibility } from "@/lib/construction";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const building = searchParams.get("building");
  const domain = searchParams.get("domain");

  if (!building || !domain) {
    return NextResponse.json(
      { error: "building and domain query params required" },
      { status: 400 }
    );
  }

  const result = checkConstructionFeasibility(building, domain);
  return NextResponse.json(result);
}
