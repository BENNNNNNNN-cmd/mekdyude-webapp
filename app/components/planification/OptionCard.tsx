"use client";

import type {
  ReverseOption,
  StaffUpOption,
  BuildNewOption,
  UpstreamDemand,
} from "@/lib/production-tree/reverse-options";

const SPHERE_ACCENT: Record<string, string> = {
  Économique: "border-l-brand-amber",
  Croyance: "border-l-purple-500/70",
  Militaire: "border-l-tartan-red",
  Magie: "border-l-sky-500/70",
  Culture: "border-l-emerald-500/70",
};
const DEFAULT_SPHERE_ACCENT = "border-l-foreground/20";

export default function OptionCard({ option, gap }: { option: ReverseOption; gap: number }) {
  const accent = SPHERE_ACCENT[option.building_sphere] ?? DEFAULT_SPHERE_ACCENT;
  const blocked = option.kind === "build_new" && option.blocked_reasons.length > 0;

  return (
    <div
      className={`rounded-xl border ${
        blocked ? "border-accent-red/30 bg-card/50" : "border-border bg-card"
      } p-4 shadow-sm border-l-4 ${accent}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KindChip option={option} />
            <span className="font-serif text-base font-semibold text-foreground">
              {option.building_name}
            </span>
            <span className="text-xs text-foreground/40">· {option.building_sphere}</span>
          </div>
          <div className="mt-0.5 text-sm text-foreground/70">
            sur <span className="font-medium text-foreground">{option.domain_name}</span>
          </div>
        </div>
        <YieldBadge yield_per_year={option.yield_per_year} gap={gap} />
      </div>

      {option.kind === "staff_up" && <StaffUpDetails option={option} />}
      {option.kind === "build_new" && <BuildNewDetails option={option} />}

      {option.upstream_demand.length > 0 && (
        <div className="mt-3 rounded-lg bg-foreground/5 p-3 text-xs">
          <div className="font-semibold text-foreground/80">Demande amont</div>
          <ul className="mt-1 space-y-0.5">
            {option.upstream_demand.map((u, i) => (
              <UpstreamRow key={i} demand={u} />
            ))}
          </ul>
        </div>
      )}

      {option.notes.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-foreground/60">
          {option.notes.map((n, i) => (
            <li key={i}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindChip({ option }: { option: ReverseOption }) {
  if (option.kind === "staff_up") {
    return (
      <span className="rounded bg-accent-green/15 px-2 py-0.5 text-xs font-medium text-accent-green">
        Staffer
      </span>
    );
  }
  if (option.blocked_reasons.length > 0) {
    return (
      <span className="rounded bg-accent-red/15 px-2 py-0.5 text-xs font-medium text-accent-red">
        Bloqué
      </span>
    );
  }
  return (
    <span className="rounded bg-brand-amber/15 px-2 py-0.5 text-xs font-medium text-brand-amber">
      Construire
    </span>
  );
}

function YieldBadge({ yield_per_year, gap }: { yield_per_year: number; gap: number }) {
  const covers = gap > 0 && yield_per_year >= gap;
  return (
    <div
      className={`rounded-lg px-3 py-1.5 text-right ${
        covers ? "bg-accent-green/10 text-accent-green" : "bg-foreground/5 text-foreground/80"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-foreground/50">Apport</div>
      <div className="font-mono text-lg font-bold leading-tight">
        +{yield_per_year}
        <span className="text-xs font-normal text-foreground/50">/an</span>
      </div>
      {gap > 0 && (
        <div className="text-[10px] text-foreground/50">
          {covers ? "couvre l’écart" : `${yield_per_year}/${gap} de l’écart`}
        </div>
      )}
    </div>
  );
}

function StaffUpDetails({ option }: { option: StaffUpOption }) {
  return (
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
      <Stat label="Staffing actuel" value={`${option.current_assigned}/${option.capacity}`} />
      <Stat label="Unités à ajouter" value={`+${option.additional_units_needed}`} />
      <Stat
        label="Apport à pleine capacité"
        value={`${option.yield_at_full_capacity}/an`}
      />
    </div>
  );
}

function BuildNewDetails({ option }: { option: BuildNewOption }) {
  return (
    <div className="mt-3 space-y-3">
      {option.blocked_reasons.length > 0 && (
        <div className="rounded-lg bg-accent-red/10 p-3 text-sm">
          <div className="font-semibold text-accent-red">Raisons du blocage</div>
          <ul className="mt-1 space-y-0.5 text-foreground/80">
            {option.blocked_reasons.map((r, i) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
        </div>
      )}

      {option.costs.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-foreground/50">
            Coûts de construction
          </div>
          <ul className="mt-1 space-y-1 text-sm">
            {option.costs.map((c, i) => (
              <CostRow key={i} cost={c} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CostRow({
  cost,
}: {
  cost: { resource: string; required: number; available: number; status: "ok" | "missing" | "manual" };
}) {
  const statusColor =
    cost.status === "ok"
      ? "text-accent-green"
      : cost.status === "missing"
      ? "text-accent-red"
      : "text-accent-amber";
  const statusIcon =
    cost.status === "ok" ? "✓" : cost.status === "missing" ? "✗" : "⚠";
  const statusLabel =
    cost.status === "ok"
      ? "OK"
      : cost.status === "missing"
      ? `manque ${cost.required - cost.available}`
      : "manuel";

  return (
    <li className="flex items-center justify-between gap-2 rounded bg-foreground/[0.02] px-2 py-1">
      <span className="font-medium text-foreground/80">{cost.resource}</span>
      <span className="font-mono text-xs text-foreground/60">
        {cost.status === "manual"
          ? `${cost.required}`
          : `${cost.required} requis · ${cost.available} dispo`}
      </span>
      <span className={`text-xs font-semibold ${statusColor}`}>
        {statusIcon} {statusLabel}
      </span>
    </li>
  );
}

function UpstreamRow({ demand }: { demand: UpstreamDemand }) {
  const ok = demand.satisfied;
  return (
    <li className={ok ? "text-accent-green/80" : "text-accent-amber"}>
      {ok ? "✓" : "⚠"} +{demand.qty} {demand.card_title}
      {!ok && (
        <span className="ml-1 text-foreground/50">
          — production actuelle insuffisante
        </span>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-foreground/[0.02] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-foreground/50">{label}</div>
      <div className="font-mono text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
