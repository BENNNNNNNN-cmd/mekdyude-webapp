import { ensureReferenceMigration, getDb } from "@/db";
import { loadRepo } from "@/lib/production-tree/engine";
import { getStades } from "@/lib/reference-postgres";

export const dynamic = "force-dynamic";

interface DomainRow {
  id: string;
  name: string;
  stage_id: string;
  stage_name: string;
  production_type: string;
  syta_quadrant: string | null;
  deposit_type: string | null;
  deposit_size: string | null;
  is_coastal: number;
  buildings_used: number;
  buildings_max: number;
  province_name: string;
  fief_name: string | null;
}

interface BuildingRow {
  domain_id: string;
  building_id: string;
  building_name: string;
  assigned_count: number;
  capacity: number;
  assignment_type: string;
  outputs: { resource: string; amount: number }[];
  sphere: string;
}

function StaffBadge({ assigned, capacity }: { assigned: number; capacity: number }) {
  if (capacity <= 0) return <span className="text-xs text-foreground/40">—</span>;
  if (assigned >= capacity) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-400">✓ {assigned}/{capacity}</span>;
  if (assigned > 0) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400">⚠ {assigned}/{capacity}</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-400">⚠ NON STAFFÉ</span>;
}

function ProductionDisplay({ building }: { building: BuildingRow }) {
  if (building.outputs.length === 0)
    return <span className="text-xs text-foreground/40">—</span>;
  if (building.outputs.length > 1) {
    return (
      <span className="font-mono text-xs">
        {building.outputs.map((o) => `${o.amount} ${o.resource}`).join(" / ")}
      </span>
    );
  }
  const o = building.outputs[0];
  return o.amount > 0 ? (
    <span className="text-xs">{o.amount} {o.resource}</span>
  ) : (
    <span className="text-xs text-foreground/40">{o.resource}</span>
  );
}

const prodTypeLabels: Record<string, string> = {
  ressource: "Ressource",
  cereale: "Céréale",
  betail: "Bétail",
};

export default async function DomainesPage() {
  await ensureReferenceMigration();
  const db = getDb();
  const [repo, stades] = await Promise.all([loadRepo(), getStades()]);
  const stadeById = new Map(stades.map((s) => [s.id, s]));

  const domainRows = db.prepare(`
    SELECT d.*, p.name AS province_name, f.name AS fief_name
    FROM domains d
    JOIN provinces p ON p.id = d.province_id
    LEFT JOIN fiefs f ON f.id = d.fief_id
    WHERE d.guild_id = 'mek_dyude'
    ORDER BY d.name
  `).all() as Array<DomainRow>;

  const domains = domainRows.map((d) => ({
    ...d,
    stage_name: stadeById.get(d.stage_id)?.nameFr ?? d.stage_id,
  }));

  const dbBuildings = db.prepare(`
    SELECT db.domain_id, db.building_template_id, db.assigned_count
    FROM domain_buildings db
    JOIN domains d ON d.id = db.domain_id
    WHERE d.guild_id = 'mek_dyude'
  `).all() as Array<{ domain_id: string; building_template_id: string; assigned_count: number }>;

  const buildingsByDomain: Record<string, BuildingRow[]> = {};
  for (const row of dbBuildings) {
    const building = repo.getBuilding(row.building_template_id);
    if (!building) continue;
    const cap = building.inputs[0]?.max_quantity ?? 0;
    const outputs = building.outputs.map((o) => {
      const per = o.quantity_per_input / Math.max(1, o.input_divisor);
      const base = row.assigned_count * per;
      const bonus = cap > 0 && row.assigned_count >= cap ? o.full_capacity_bonus : 0;
      return { resource: o.card_title, amount: base + bonus };
    });
    (buildingsByDomain[row.domain_id] ??= []).push({
      domain_id: row.domain_id,
      building_id: building.id,
      building_name: building.name,
      assigned_count: row.assigned_count,
      capacity: cap,
      assignment_type: building.inputs[0]?.card_title ?? "",
      outputs,
      sphere: building.sphere,
    });
  }
  for (const list of Object.values(buildingsByDomain)) {
    list.sort((a, b) => a.building_name.localeCompare(b.building_name, "fr"));
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <h1 className="font-serif text-3xl font-bold text-foreground">Domaines</h1>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {domains.map((domain) => {
          const domainBuildings = buildingsByDomain[domain.id] || [];
          const freeSlots = domain.buildings_max - domain.buildings_used;
          const understaffed = domainBuildings.filter(
            (b) => b.capacity > 0 && b.assigned_count < b.capacity
          ).length;

          return (
            <div key={domain.id} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 bg-parchment-dark/50 border-b border-border">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-serif text-xl font-bold">{domain.name}</h2>
                    <p className="text-sm text-foreground/60 mt-0.5">
                      {domain.province_name}{domain.fief_name ? ` — ${domain.fief_name}` : ""}
                    </p>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-sidebar text-white">
                    {domain.stage_name}
                  </span>
                </div>

                {/* Info row */}
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-foreground/70">
                  <span>📦 Prod: <strong>{prodTypeLabels[domain.production_type] || domain.production_type}</strong></span>
                  {domain.syta_quadrant && <span>🧭 Syta: <strong>{domain.syta_quadrant}</strong></span>}
                  {domain.deposit_type && <span>💎 {domain.deposit_type} ({domain.deposit_size})</span>}
                  {domain.is_coastal ? <span>🌊 Côtier</span> : null}
                  <span>🏗 Bâtiments: <strong>{domain.buildings_used}/{domain.buildings_max}</strong> ({freeSlots} libre{freeSlots !== 1 ? "s" : ""})</span>
                  {understaffed > 0 && <span className="text-amber-600">⚠ {understaffed} sous-staffé{understaffed !== 1 ? "s" : ""}</span>}
                </div>
              </div>

              {/* Buildings table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-2 text-left text-xs uppercase tracking-wider text-foreground/60">Bâtiment</th>
                      <th className="px-5 py-2 text-left text-xs uppercase tracking-wider text-foreground/60">Sphère</th>
                      <th className="px-5 py-2 text-left text-xs uppercase tracking-wider text-foreground/60">Production</th>
                      <th className="px-5 py-2 text-center text-xs uppercase tracking-wider text-foreground/60">Staffing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainBuildings.map((b, i) => (
                      <tr key={b.building_name} className={i % 2 === 0 ? "bg-card" : "bg-parchment/30"}>
                        <td className="px-5 py-1.5 font-medium">{b.building_name}</td>
                        <td className="px-5 py-1.5 text-foreground/60 text-xs">{b.sphere}</td>
                        <td className="px-5 py-1.5"><ProductionDisplay building={b} /></td>
                        <td className="px-5 py-1.5 text-center">
                          <StaffBadge assigned={b.assigned_count} capacity={b.capacity} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
