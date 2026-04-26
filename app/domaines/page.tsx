import { getDb } from "@/db";

// Reads directly from SQLite — Next.js can't track invalidation, so force
// per-request rendering. Without this, the page is prerendered at build time
// and the first cold visit serves stale data until Cmd+Shift+R.
export const dynamic = "force-dynamic";

interface DomainRow {
  id: string;
  name: string;
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
  building_name: string;
  assigned_count: number;
  capacity: number;
  assignment_type: string;
  resource_produced: string;
  ratio_per_unit: number;
  sphere: string;
}

function StaffBadge({ assigned, capacity, name }: { assigned: number; capacity: number; name: string }) {
  if (capacity <= 0) return <span className="text-xs text-foreground/40">—</span>;
  if (assigned >= capacity) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-400">✓ {assigned}/{capacity}</span>;
  if (assigned > 0) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400">⚠ {assigned}/{capacity}</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-400">⚠ NON STAFFÉ</span>;
}

function ProductionDisplay({ building }: { building: BuildingRow }) {
  if (building.building_name === "Abbaye") {
    const v = building.assigned_count * 7;
    const e = building.assigned_count * 7;
    const a = building.assigned_count * 3;
    return <span className="font-mono text-xs">V{v} / É{e} / A{a}</span>;
  }
  const amount = building.assigned_count * (building.ratio_per_unit ?? 0);
  if (amount > 0) return <span className="text-xs">{amount} {building.resource_produced}</span>;
  return <span className="text-xs text-foreground/40">{building.resource_produced || "—"}</span>;
}

const prodTypeLabels: Record<string, string> = {
  ressource: "Ressource",
  cereale: "Céréale",
  betail: "Bétail",
};

export default function DomainesPage() {
  const db = getDb();

  const domains = db.prepare(`
    SELECT d.*, st.name as stage_name, p.name as province_name, f.name as fief_name
    FROM domains d
    JOIN stage_templates st ON st.id = d.stage_id
    JOIN provinces p ON p.id = d.province_id
    LEFT JOIN fiefs f ON f.id = d.fief_id
    WHERE d.guild_id = 'mek_dyude'
    ORDER BY d.name
  `).all() as DomainRow[];

  const buildings = db.prepare(`
    SELECT db.domain_id, bt.name as building_name, db.assigned_count, bt.capacity,
           bt.assignment_type, bt.resource_produced, bt.ratio_per_unit, bt.sphere
    FROM domain_buildings db
    JOIN building_templates bt ON bt.id = db.building_template_id
    JOIN domains d ON d.id = db.domain_id
    WHERE d.guild_id = 'mek_dyude'
    ORDER BY bt.name
  `).all() as BuildingRow[];

  const buildingsByDomain: Record<string, BuildingRow[]> = {};
  for (const b of buildings) {
    if (!buildingsByDomain[b.domain_id]) buildingsByDomain[b.domain_id] = [];
    buildingsByDomain[b.domain_id].push(b);
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
                          <StaffBadge assigned={b.assigned_count} capacity={b.capacity} name={b.building_name} />
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
