import { ensureReferenceMigration, getDb } from "@/db";
import { loadRepo } from "@/lib/production-tree/engine";
import { getStades } from "@/lib/reference-postgres";
import { Banner, GhostButton, PrimaryButton } from "@/app/components/v3/Banner";
import { Folio } from "@/app/components/v3/Folio";
import { Badge, OutlinedBadge } from "@/app/components/v3/Badge";

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

  const domainRows = db
    .prepare(
      `SELECT d.*, p.name AS province_name, f.name AS fief_name
       FROM domains d
       JOIN provinces p ON p.id = d.province_id
       LEFT JOIN fiefs f ON f.id = d.fief_id
       WHERE d.guild_id = 'mek_dyude'
       ORDER BY d.name`
    )
    .all() as Array<DomainRow>;

  const domains = domainRows.map((d) => ({
    ...d,
    stage_name: stadeById.get(d.stage_id)?.nameFr ?? d.stage_id,
  }));

  const dbBuildings = db
    .prepare(
      `SELECT db.domain_id, db.building_template_id, db.assigned_count
       FROM domain_buildings db
       JOIN domains d ON d.id = db.domain_id
       WHERE d.guild_id = 'mek_dyude'`
    )
    .all() as Array<{
    domain_id: string;
    building_template_id: string;
    assigned_count: number;
  }>;

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

  const totalUsed = domains.reduce((sum, d) => sum + d.buildings_used, 0);
  const totalMax = domains.reduce((sum, d) => sum + d.buildings_max, 0);

  return (
    <div className="max-w-[1400px] mx-auto">
      <Banner
        title="Domaines du clan"
        sub={`${domains.length} domaine${domains.length !== 1 ? "s" : ""} · ${totalUsed}/${totalMax} bâtiments`}
        actions={
          <>
            <GhostButton>↓ Carte du clan</GhostButton>
            <PrimaryButton>† Bâtir</PrimaryButton>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {domains.map((domain) => {
          const domainBuildings = buildingsByDomain[domain.id] || [];
          const freeSlots = domain.buildings_max - domain.buildings_used;
          const understaffed = domainBuildings.filter(
            (b) => b.capacity > 0 && b.assigned_count < b.capacity
          ).length;
          return (
            <Folio key={domain.id}>
              <DomainHeader
                name={domain.name}
                province={domain.province_name}
                fief={domain.fief_name}
                stage={domain.stage_name}
                prodType={prodTypeLabels[domain.production_type] || domain.production_type}
                syta={domain.syta_quadrant}
                deposit={domain.deposit_type}
                depositSize={domain.deposit_size}
                isCoastal={!!domain.is_coastal}
                used={domain.buildings_used}
                max={domain.buildings_max}
                freeSlots={freeSlots}
                understaffed={understaffed}
              />
              {domainBuildings.length === 0 ? (
                <div
                  className="px-5 py-12 text-center font-serif-body italic text-parch-muted"
                  style={{ background: "rgba(160,98,42,0.04)" }}
                >
                  <div className="text-3xl text-gold/40 mb-2">⌂</div>
                  Aucun bâtiment construit. {freeSlots} emplacement
                  {freeSlots !== 1 ? "s" : ""} libre{freeSlots !== 1 ? "s" : ""}.
                </div>
              ) : (
                <BuildingsTable buildings={domainBuildings} />
              )}
            </Folio>
          );
        })}
      </div>
    </div>
  );
}

function DomainHeader({
  name,
  province,
  fief,
  stage,
  prodType,
  syta,
  deposit,
  depositSize,
  isCoastal,
  used,
  max,
  freeSlots,
  understaffed,
}: {
  name: string;
  province: string;
  fief: string | null;
  stage: string;
  prodType: string;
  syta: string | null;
  deposit: string | null;
  depositSize: string | null;
  isCoastal: boolean;
  used: number;
  max: number;
  freeSlots: number;
  understaffed: number;
}) {
  return (
    <div
      className="px-5 py-4"
      style={{
        background:
          "linear-gradient(180deg, rgba(160,98,42,0.22), rgba(160,98,42,0.08))",
        borderBottom: "2px solid #8B1A1A",
      }}
    >
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          <div
            className="font-serif font-bold leading-none text-parch-ink"
            style={{ fontSize: 22, letterSpacing: "0.08em" }}
          >
            {name}
          </div>
          <div className="mt-1.5 text-sm italic text-parch-ink-soft">
            {province}
            {fief ? ` · ${fief}` : ""}
          </div>
        </div>
        <Badge color="#8B1A1A">{stage}</Badge>
      </div>

      <div
        className="flex flex-wrap items-center mt-3 text-xs text-parch-ink-soft"
        style={{ gap: "6px 14px" }}
      >
        <MetaPill icon="⚙" label="Prod" value={prodType} />
        {syta && <MetaPill icon="✦" label="Syta" value={syta} />}
        {deposit && (
          <MetaPill
            icon="◈"
            label="Gisement"
            value={depositSize ? `${deposit} (${depositSize})` : deposit}
          />
        )}
        {isCoastal && <MetaPill icon="≈" label="" value="Côtier" />}
        <MetaPill
          icon="⌂"
          label="Bâtiments"
          value={`${used}/${max} · ${freeSlots} libre${freeSlots !== 1 ? "s" : ""}`}
        />
        {understaffed > 0 && (
          <OutlinedBadge color="#8B1A1A">
            ⚠ {understaffed} sous-staffé{understaffed !== 1 ? "s" : ""}
          </OutlinedBadge>
        )}
      </div>
    </div>
  );
}

function MetaPill({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-parch-ink-soft">
      <span style={{ color: "#A0622A" }}>{icon}</span>
      {label && (
        <span
          className="font-serif text-[9px] font-bold uppercase text-parch-muted"
          style={{ letterSpacing: "0.16em" }}
        >
          {label}
        </span>
      )}
      <strong className="font-bold" style={{ color: "#1a1008" }}>
        {value}
      </strong>
    </span>
  );
}

function BuildingsTable({ buildings }: { buildings: BuildingRow[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          <Th>Bâtiment</Th>
          <Th>Sphère</Th>
          <Th>Production</Th>
          <Th align="center">Staff</Th>
        </tr>
      </thead>
      <tbody>
        {buildings.map((b, i) => {
          const unstaffed = b.capacity > 0 && b.assigned_count === 0;
          return (
            <tr
              key={b.building_name}
              style={i % 2 === 1 ? { background: "rgba(160,98,42,0.05)" } : undefined}
            >
              <Td>
                <span className="font-serif font-semibold text-[14px]">{b.building_name}</span>
              </Td>
              <Td>
                <span className="italic text-parch-ink-soft text-[13px]">{b.sphere}</span>
              </Td>
              <Td>
                <ProductionCell building={b} unstaffed={unstaffed} />
              </Td>
              <Td align="center">
                <StaffPlaque
                  assigned={b.assigned_count}
                  capacity={b.capacity}
                />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ProductionCell({
  building,
  unstaffed,
}: {
  building: BuildingRow;
  unstaffed: boolean;
}) {
  if (building.outputs.length === 0) {
    return <span className="text-parch-muted text-xs">—</span>;
  }
  const style = {
    color: unstaffed ? "#8B1A1A" : "#1a1008",
  } as const;
  if (building.outputs.length > 1) {
    return (
      <span className="font-serif font-semibold text-[13px]" style={style}>
        {building.outputs.map((o) => `${o.amount} ${o.resource}`).join(" / ")}
      </span>
    );
  }
  const o = building.outputs[0];
  return (
    <span className="font-serif font-semibold text-[13px]" style={style}>
      {o.amount > 0 ? `${o.amount} ${o.resource}` : `— ${o.resource || "—"}`}
    </span>
  );
}

function StaffPlaque({
  assigned,
  capacity,
}: {
  assigned: number;
  capacity: number;
}) {
  if (capacity <= 0) {
    return <span className="text-parch-muted text-xs">—</span>;
  }
  if (assigned >= capacity) {
    return (
      <OutlinedBadge color="#3d6e2a">
        ✓ {assigned}/{capacity}
      </OutlinedBadge>
    );
  }
  if (assigned > 0) {
    return (
      <OutlinedBadge color="#A0622A">
        ◐ {assigned}/{capacity}
      </OutlinedBadge>
    );
  }
  return (
    <OutlinedBadge color="#8B1A1A">
      ✗ 0/{capacity}
    </OutlinedBadge>
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
      className="font-serif font-bold uppercase text-[10px] px-4 py-2.5 text-parch-muted"
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
      className="px-4 py-2 text-parch-ink align-middle"
      style={{
        textAlign: align,
        borderBottom: "1px solid rgba(139,32,32,0.14)",
      }}
    >
      {children}
    </td>
  );
}
