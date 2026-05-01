import { getDb, ensureReferenceMigration } from "@/db";
import {
  getProductionSummary,
  isMultiOutputProduction,
  type ProductionEntry,
} from "@/lib/production";
import { computeMaintenance } from "@/lib/maintenance";
import {
  checkConstructionFeasibility,
  type FeasibilityResult,
} from "@/lib/construction";

// Mixes SQLite operational tables and Postgres reference data; force per-request
// rendering to avoid prerendering against stale snapshots.
export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  if (status === "full") return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-400">✓ Plein</span>;
  if (status === "partial") return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400">⚠ Partiel</span>;
  if (status === "unstaffed") return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-400">⚠ NON STAFFÉ</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400">—</span>;
}

export default async function Dashboard() {
  await ensureReferenceMigration();
  const db = getDb();
  const [{ production, totals }, maintenance, academie, collegeOcculte] = await Promise.all([
    getProductionSummary(),
    computeMaintenance(),
    checkConstructionFeasibility("BAT_ACADEMIE", "kintyre"),
    checkConstructionFeasibility("BAT_COLLEGE_OCCULTE", "kintyre"),
  ]);

  const solarRow = db.prepare(
    "SELECT qty_coffre + qty_en_mains as total FROM inventory WHERE guild_id = 'mek_dyude' AND lower(item_name) = 'solar'"
  ).get() as { total: number } | undefined;
  const solar = solarRow?.total ?? 0;

  const distinctResources = Object.keys(totals).length;

  const domainsData = db.prepare(
    "SELECT SUM(buildings_used) as used, SUM(buildings_max) as max FROM domains WHERE guild_id = 'mek_dyude'"
  ).get() as { used: number; max: number };

  const alertCount = production.filter(
    (p: ProductionEntry) => p.staffingStatus === "unstaffed" || p.staffingStatus === "partial"
  ).length;

  const byDomain: Record<string, ProductionEntry[]> = {};
  for (const p of production) {
    if (!byDomain[p.domainId]) byDomain[p.domainId] = [];
    byDomain[p.domainId].push(p);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <h1 className="font-serif text-3xl font-bold text-foreground">Tableau de bord</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Solar" value={solar.toLocaleString("fr-CA") + " $"} icon="$" color="amber" />
        <KPICard title="Production totale" value={`${distinctResources} ressources`} icon="⚙" color="blue" />
        <KPICard title="Bâtiments" value={`${domainsData.used}/${domainsData.max}`} icon="🏠" color="green" />
        <KPICard title="Alertes" value={alertCount.toString()} icon="⚠" color={alertCount > 0 ? "red" : "green"} />
      </div>

      {/* Production by Domain */}
      <section>
        <h2 className="font-serif text-2xl font-bold mb-4">Production par domaine</h2>
        <div className="space-y-6">
          {Object.entries(byDomain).map(([domainId, entries]) => (
            <div key={domainId} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-parchment-dark/50 border-b border-border">
                <h3 className="font-serif text-lg font-bold">{entries[0].domainName}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Bâtiment</th>
                      <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Type</th>
                      <th className="px-5 py-2.5 text-center text-xs uppercase tracking-wider text-foreground/60">Affectés</th>
                      <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Production</th>
                      <th className="px-5 py-2.5 text-center text-xs uppercase tracking-wider text-foreground/60">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-parchment/30"}>
                        <td className="px-5 py-2 font-medium">{entry.buildingName}</td>
                        <td className="px-5 py-2 text-foreground/60">{entry.assignmentType}</td>
                        <td className="px-5 py-2 text-center">
                          {entry.capacity > 0 ? `${entry.assignedCount}/${entry.capacity}` : "—"}
                        </td>
                        <td className="px-5 py-2">
                          {isMultiOutputProduction(entry) ? (
                            <span className="font-mono text-sm">
                              {entry.lines.map((l) => `${l.amount} ${l.resource}`).join(" / ")}
                            </span>
                          ) : (
                            entry.amount > 0 ? (
                              <span>{entry.amount} {entry.resource}</span>
                            ) : (
                              <span className="text-foreground/40">{entry.resource || "—"}</span>
                            )
                          )}
                        </td>
                        <td className="px-5 py-2 text-center">
                          <StatusBadge status={entry.staffingStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Maintenance + Construction side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Annual Maintenance */}
        <section>
          <h2 className="font-serif text-2xl font-bold mb-4">Bilan entretien annuel</h2>
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-parchment-dark/50">
                  <th className="px-5 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Ressource</th>
                  <th className="px-5 py-2.5 text-right text-xs uppercase tracking-wider text-foreground/60">Requis/an</th>
                  <th className="px-5 py-2.5 text-right text-xs uppercase tracking-wider text-foreground/60">Produit/an</th>
                  <th className="px-5 py-2.5 text-center text-xs uppercase tracking-wider text-foreground/60">Statut</th>
                </tr>
              </thead>
              <tbody>
                {maintenance.map((m, i) => (
                  <tr key={m.resource} className={`${i % 2 === 0 ? "bg-card" : "bg-parchment/30"} ${m.status === "warning" ? "text-red-700" : ""}`}>
                    <td className="px-5 py-2 font-medium">{m.resource}</td>
                    <td className="px-5 py-2 text-right">{m.required}</td>
                    <td className="px-5 py-2 text-right">{m.produced}</td>
                    <td className="px-5 py-2 text-center">
                      {m.status === "ok" ? (
                        <span className="text-green-600 font-medium">✓</span>
                      ) : (
                        <span className="text-red-600 font-medium">⚠ Déficit</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Construction Projects */}
        <section>
          <h2 className="font-serif text-2xl font-bold mb-4">Projets de construction</h2>
          <div className="space-y-4">
            <ConstructionCard result={academie} />
            <ConstructionCard result={collegeOcculte} />
          </div>
        </section>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, color }: { title: string; value: string; icon: string; color: string }) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400",
    blue: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-400",
    green: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800/40 text-green-700 dark:text-green-400",
    red: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400",
  };
  const iconColors: Record<string, string> = {
    amber: "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400",
    blue: "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400",
    green: "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400",
    red: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]} shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider opacity-70 mb-1">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${iconColors[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ConstructionCard({ result }: { result: FeasibilityResult }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-parchment-dark/50 border-b border-border flex items-center justify-between">
        <h3 className="font-serif font-bold">{result.buildingName}</h3>
        <span className="text-xs text-foreground/50">sur {result.domainName}</span>
      </div>
      {result.reasons.length > 0 && (
        <div className="px-5 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900/40">
          {result.reasons.map((r, i) => (
            <p key={i} className="text-xs text-red-700 dark:text-red-400">✗ {r}</p>
          ))}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-2 text-left text-xs uppercase tracking-wider text-foreground/60">Ressource</th>
            <th className="px-5 py-2 text-right text-xs uppercase tracking-wider text-foreground/60">Requis</th>
            <th className="px-5 py-2 text-right text-xs uppercase tracking-wider text-foreground/60">Disponible</th>
            <th className="px-5 py-2 text-center text-xs uppercase tracking-wider text-foreground/60">Statut</th>
          </tr>
        </thead>
        <tbody>
          {result.costs.map((c, i) => (
            <tr key={i} className={i % 2 === 0 ? "" : "bg-parchment/30"}>
              <td className="px-5 py-1.5">{c.resource}</td>
              <td className="px-5 py-1.5 text-right">{c.required}</td>
              <td className="px-5 py-1.5 text-right">{c.status === "manual" ? "—" : c.available}</td>
              <td className="px-5 py-1.5 text-center">
                {c.status === "ok" && <span className="text-green-600 text-xs font-medium">✓ OK</span>}
                {c.status === "missing" && <span className="text-red-600 text-xs font-medium">✗ MANQUE</span>}
                {c.status === "manual" && <span className="text-amber-600 text-xs font-medium">⚠ Manuel</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
