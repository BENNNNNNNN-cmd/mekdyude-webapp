import { getDb, ensureReferenceMigration } from "@/db";
import {
  getProductionSummary,
  isMultiOutputProduction,
  type ProductionEntry,
} from "@/lib/production";
import { computeMaintenance, type MaintenanceLine } from "@/lib/maintenance";
import {
  checkConstructionFeasibility,
  type FeasibilityResult,
  type FeasibilityLine,
} from "@/lib/construction";
import { getStades } from "@/lib/reference-postgres";
import { Banner, GhostButton, PrimaryButton } from "@/app/components/v3/Banner";
import {
  StonePlaque,
  StonePlaqueGrid,
} from "@/app/components/v3/StonePlaque";
import { Folio, FolioHeader } from "@/app/components/v3/Folio";
import { SectionTitle } from "@/app/components/v3/SectionTitle";
import { OutlinedBadge } from "@/app/components/v3/Badge";

// Mixes SQLite operational tables and Postgres reference data; force per-request
// rendering to avoid prerendering against stale snapshots.
export const dynamic = "force-dynamic";

const STATUS = {
  good: "#3d6e2a",
  warn: "#A0622A",
  bad: "#8B1A1A",
  cream: "#f4ead2",
  goldLight: "#c8842a",
  greenLight: "#7fb15c",
};

function currentSeason(date = new Date()): string {
  const m = date.getMonth() + 1; // 1–12
  const y = date.getFullYear();
  if (m >= 3 && m <= 5) return `Printemps ${y}`;
  if (m >= 6 && m <= 8) return `Été ${y}`;
  if (m >= 9 && m <= 11) return `Automne ${y}`;
  // Dec, Jan, Feb — winter rolls year over from Dec
  return `Hiver ${m === 12 ? y + 1 : y}`;
}

export default async function Dashboard() {
  await ensureReferenceMigration();
  const db = getDb();
  const [{ production }, maintenance, academie, collegeOcculte, stades] =
    await Promise.all([
      getProductionSummary(),
      computeMaintenance(),
      checkConstructionFeasibility("BAT_ACADEMIE", "kintyre"),
      checkConstructionFeasibility("BAT_COLLEGE_OCCULTE", "kintyre"),
      getStades(),
    ]);
  const stageNameById = new Map(stades.map((s) => [s.id, s.nameFr]));

  const solarRow = db
    .prepare(
      "SELECT qty_coffre + qty_en_mains as total FROM inventory WHERE guild_id = 'mek_dyude' AND lower(item_name) = 'solar'"
    )
    .get() as { total: number } | undefined;
  const solar = solarRow?.total ?? 0;

  const distinctResources = new Set(
    production.flatMap((p) =>
      isMultiOutputProduction(p) ? p.lines.map((l) => l.resource) : [p.resource]
    ).filter(Boolean)
  ).size;

  const buildingsAgg = db
    .prepare(
      "SELECT SUM(buildings_used) as used, SUM(buildings_max) as max FROM domains WHERE guild_id = 'mek_dyude'"
    )
    .get() as { used: number; max: number };

  const alertCount = production.filter(
    (p) => p.staffingStatus === "unstaffed" || p.staffingStatus === "partial"
  ).length;

  const domainMetaRows = db
    .prepare(
      `SELECT d.id, d.name, d.stage_id, p.name AS province_name
       FROM domains d
       JOIN provinces p ON p.id = d.province_id
       WHERE d.guild_id = 'mek_dyude'`
    )
    .all() as Array<{ id: string; name: string; stage_id: string; province_name: string }>;
  const metaById = new Map(domainMetaRows.map((d) => [d.id, d]));

  const byDomain: Record<string, ProductionEntry[]> = {};
  for (const p of production) {
    if (!byDomain[p.domainId]) byDomain[p.domainId] = [];
    byDomain[p.domainId].push(p);
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <Banner
        title="Tableau de bord"
        sub={`Saison de ${currentSeason().toLowerCase()} · Bilan du clan Mek Dyude`}
        actions={
          <>
            <GhostButton>↓ Folio annuel</GhostButton>
            <PrimaryButton>† Nouvelle saison</PrimaryButton>
          </>
        }
      />

      <StonePlaqueGrid cols={4}>
        <StonePlaque
          label="Solar"
          value={solar.toLocaleString("fr-CA")}
          sub="au coffre & en mains"
          valueColor={STATUS.goldLight}
        />
        <StonePlaque
          label="Production"
          value={distinctResources}
          sub="ressources / saison"
          valueColor={STATUS.greenLight}
        />
        <StonePlaque
          label="Bâtiments"
          value={`${buildingsAgg.used ?? 0}/${buildingsAgg.max ?? 0}`}
          sub={`${Math.max(0, (buildingsAgg.max ?? 0) - (buildingsAgg.used ?? 0))} emplacements libres`}
          valueColor={STATUS.cream}
        />
        <StonePlaque
          label="Alertes"
          value={alertCount}
          sub={alertCount > 0 ? "bâtiments sous-staffés" : "aucune alerte"}
          valueColor={alertCount > 0 ? STATUS.bad : STATUS.good}
        />
      </StonePlaqueGrid>

      <div className="mb-6">
        <SectionTitle>Production par domaine</SectionTitle>
        <div className="space-y-3.5">
          {Object.entries(byDomain).map(([domainId, entries]) => {
            const meta = metaById.get(domainId);
            const metaLabel = meta
              ? `Province de ${meta.province_name} · ${stageNameById.get(meta.stage_id) ?? meta.stage_id}`
              : entries[0].domainName;
            return (
              <Folio key={domainId}>
                <FolioHeader title={entries[0].domainName} meta={metaLabel} />
                <DomainTable entries={entries} />
              </Folio>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <SectionTitle>Bilan entretien annuel</SectionTitle>
          <Folio>
            <FolioHeader title="Coûts récurrents" />
            <MaintenanceTable rows={maintenance} />
          </Folio>
        </div>

        <div>
          <SectionTitle>Projets de construction</SectionTitle>
          <div className="space-y-3.5">
            <ConstructionFolio result={academie} />
            <ConstructionFolio result={collegeOcculte} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DomainTable({ entries }: { entries: ProductionEntry[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          <Th>Bâtiment</Th>
          <Th>Affectation</Th>
          <Th align="center">Affectés</Th>
          <Th>Production / saison</Th>
          <Th align="center">Statut</Th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => {
          const unstaffed = entry.staffingStatus === "unstaffed";
          return (
            <tr key={i} style={i % 2 === 1 ? { background: "rgba(160,98,42,0.05)" } : undefined}>
              <Td>
                <span className="font-serif font-semibold text-[15px]">
                  {entry.buildingName}
                </span>
              </Td>
              <Td>
                <span className="italic text-parch-ink-soft">{entry.assignmentType}</span>
              </Td>
              <Td align="center">
                <span className="font-serif font-bold tabular-nums">
                  {entry.capacity > 0 ? `${entry.assignedCount}/${entry.capacity}` : "—"}
                </span>
              </Td>
              <Td>
                <ProductionCell entry={entry} unstaffed={unstaffed} />
              </Td>
              <Td align="center">
                <StaffSeal status={entry.staffingStatus} />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ProductionCell({ entry, unstaffed }: { entry: ProductionEntry; unstaffed: boolean }) {
  if (isMultiOutputProduction(entry)) {
    return (
      <span
        className="font-serif font-semibold"
        style={{ color: unstaffed ? STATUS.bad : "var(--color-parch-ink)" }}
      >
        {entry.lines.map((l) => `${l.amount} ${l.resource}`).join(" / ")}
      </span>
    );
  }
  if (entry.amount > 0) {
    return (
      <span
        className="font-serif font-semibold"
        style={{ color: unstaffed ? STATUS.bad : "var(--color-parch-ink)" }}
      >
        {entry.amount} {entry.resource}
      </span>
    );
  }
  return (
    <span
      className="font-serif font-semibold"
      style={{ color: STATUS.bad }}
    >
      — {entry.resource || "—"}
    </span>
  );
}

function StaffSeal({ status }: { status: ProductionEntry["staffingStatus"] }) {
  if (status === "full")
    return <OutlinedBadge color={STATUS.good}>✓ Plein</OutlinedBadge>;
  if (status === "partial")
    return <OutlinedBadge color={STATUS.warn}>◐ Partiel</OutlinedBadge>;
  if (status === "unstaffed")
    return <OutlinedBadge color={STATUS.bad}>✗ Non staffé</OutlinedBadge>;
  return <span className="text-parch-muted text-xs">—</span>;
}

function MaintenanceTable({ rows }: { rows: MaintenanceLine[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          <Th>Ressource</Th>
          <Th align="right">Requis / an</Th>
          <Th align="right">Produit / an</Th>
          <Th align="center">Statut</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m, i) => {
          const ok = m.status === "ok";
          return (
            <tr key={m.resource} style={i % 2 === 1 ? { background: "rgba(160,98,42,0.05)" } : undefined}>
              <Td>
                <span className="font-serif font-semibold text-[15px]">{m.resource}</span>
              </Td>
              <Td align="right">
                <span className="font-serif tabular-nums">{m.required}</span>
              </Td>
              <Td align="right">
                <span
                  className="font-serif font-bold tabular-nums"
                  style={{ color: ok ? STATUS.good : STATUS.bad }}
                >
                  {m.produced}
                </span>
              </Td>
              <Td align="center">
                <OutlinedBadge color={ok ? STATUS.good : STATUS.bad}>
                  {ok ? "✓ OK" : "⚠ Déficit"}
                </OutlinedBadge>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ConstructionFolio({ result }: { result: FeasibilityResult }) {
  return (
    <Folio>
      <FolioHeader title={result.buildingName} meta={`sur ${result.domainName}`} />
      {result.reasons.length > 0 && (
        <div
          className="px-5 py-2.5 text-sm italic"
          style={{
            background: "rgba(139,32,32,0.12)",
            borderBottom: "1px solid rgba(139,32,32,0.3)",
            color: "#4a0a0a",
          }}
        >
          {result.reasons.map((r, i) => (
            <p key={i}>⚠ {r}</p>
          ))}
        </div>
      )}
      <ConstructionTable costs={result.costs} />
    </Folio>
  );
}

function ConstructionTable({ costs }: { costs: FeasibilityLine[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          <Th>Ressource</Th>
          <Th align="right">Requis</Th>
          <Th align="right">Coffre</Th>
          <Th align="center">Statut</Th>
        </tr>
      </thead>
      <tbody>
        {costs.map((c, i) => (
          <tr key={i} style={i % 2 === 1 ? { background: "rgba(160,98,42,0.05)" } : undefined}>
            <Td>
              <span className="font-serif font-semibold">{c.resource}</span>
            </Td>
            <Td align="right">
              <span className="font-serif tabular-nums">{c.required}</span>
            </Td>
            <Td align="right">
              <span className="font-serif tabular-nums">
                {c.status === "manual" ? "—" : c.available}
              </span>
            </Td>
            <Td align="center">
              {c.status === "ok" && (
                <OutlinedBadge color={STATUS.good}>✓ OK</OutlinedBadge>
              )}
              {c.status === "missing" && (
                <OutlinedBadge color={STATUS.bad}>✗ Manque</OutlinedBadge>
              )}
              {c.status === "manual" && (
                <OutlinedBadge color={STATUS.warn}>⚠ Manuel</OutlinedBadge>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className="font-serif font-bold uppercase text-[10px] px-4 py-3 text-parch-muted"
      style={{
        letterSpacing: "0.18em",
        textAlign: align,
        borderBottom: "2px solid rgba(139,32,32,0.3)",
        background: "rgba(160,98,42,0.08)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className="px-4 py-3 text-parch-ink align-middle"
      style={{
        textAlign: align,
        borderBottom: "1px solid rgba(139,32,32,0.14)",
      }}
    >
      {children}
    </td>
  );
}
