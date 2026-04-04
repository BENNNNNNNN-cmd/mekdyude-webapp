import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sphere = searchParams.get("sphere");

  const db = getDb();

  let query = `
    SELECT bt.*, GROUP_CONCAT(cc.resource_type || ':' || cc.amount, '|') as costs_raw
    FROM building_templates bt
    LEFT JOIN construction_costs cc ON cc.building_id = bt.id
  `;
  const params: string[] = [];

  if (sphere) {
    query += " WHERE bt.sphere = ?";
    params.push(sphere);
  }

  query += " GROUP BY bt.id ORDER BY bt.sphere, bt.name";

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

  const result = rows.map((row) => {
    const costsRaw = row.costs_raw as string | null;
    const costs: Record<string, number> = {};
    if (costsRaw) {
      for (const pair of costsRaw.split("|")) {
        const [resource, amount] = pair.split(":");
        costs[resource] = parseInt(amount);
      }
    }
    const { costs_raw: _, ...rest } = row;
    return { ...rest, construction_costs: costs };
  });

  return NextResponse.json(result);
}
