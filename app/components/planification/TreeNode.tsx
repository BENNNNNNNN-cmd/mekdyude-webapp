"use client";

import { useState } from "react";
import type {
  CardNode,
  BuildingTreeEntry,
  OutputTreeEntry,
  BuildingOutput,
  OutputConstraint,
} from "@/lib/production-tree/types";

const SCOPE_LABELS: Record<OutputConstraint["scope"], string> = {
  domain: "domaine",
  fief: "fief",
  province: "province",
  region: "région",
};

/** Top-level: render a card node and all its consuming buildings. */
export default function TreeNode({ node }: { node: CardNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <CardRow node={node} isRoot />
    </div>
  );
}

function CardRow({ node, isRoot = false }: { node: CardNode; isRoot?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 font-serif">
        <CardIcon />
        <span className={isRoot ? "text-xl font-semibold text-foreground" : "text-base font-medium text-foreground"}>
          {node.card.title}
        </span>
        {node.alreadyShown && (
          <span className="rounded bg-foreground/10 px-2 py-0.5 text-xs italic text-foreground/60">
            déjà affiché
          </span>
        )}
        {!node.alreadyShown && node.buildings.length === 0 && !isRoot && (
          <span className="text-xs italic text-foreground/40">aucun bâtiment</span>
        )}
      </div>

      {node.buildings.length > 0 && (
        <div className="mt-3 space-y-2 border-l-2 border-border/60 pl-4">
          {node.buildings.map((b) => (
            <BuildingRow key={b.building.id} entry={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuildingRow({ entry }: { entry: BuildingTreeEntry }) {
  const inputForThisCard = entry.building.inputs.find(
    (i) => i.card_id === entry.matchedInputCardId
  );
  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <BuildingIcon />
        <span className="font-semibold text-foreground">{entry.building.name}</span>
        {inputForThisCard && (
          <span className="text-xs text-foreground/60">
            capacité {inputForThisCard.max_quantity}
          </span>
        )}
        <span className="text-xs text-foreground/40">· {entry.building.sphere}</span>
      </div>

      {entry.outputs.length > 0 && (
        <div className="mt-1.5 space-y-1.5 pl-6">
          {entry.outputs.map((o) => (
            <OutputRow key={o.output.card_id} entry={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function OutputRow({ entry }: { entry: OutputTreeEntry }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = !entry.child.alreadyShown && entry.child.buildings.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          aria-label={expanded ? "Réduire" : "Étendre"}
          disabled={!canExpand}
          onClick={() => setExpanded(!expanded)}
          className={`flex h-5 w-5 items-center justify-center rounded text-xs transition ${
            canExpand
              ? "text-foreground/70 hover:bg-brand-amber/20 hover:text-brand-amber"
              : "text-foreground/20"
          }`}
        >
          {canExpand ? (expanded ? "▾" : "▸") : "·"}
        </button>
        <ArrowIcon />
        <span className="font-medium text-accent-green">{entry.output.card_title}</span>
        <RatioBadge output={entry.output} />
        {entry.output.full_capacity_bonus > 0 && (
          <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-xs text-accent-green">
            +{entry.output.full_capacity_bonus} pleine capacité
          </span>
        )}
        {entry.output.use_domain_mineral && (
          <span className="rounded bg-accent-amber/15 px-1.5 py-0.5 text-xs text-accent-amber">
            ⚠ requiert dépôt
          </span>
        )}
        {entry.output.constraints.map((c, i) => (
          <ConstraintBadge key={i} c={c} />
        ))}
        {entry.child.alreadyShown && (
          <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs italic text-foreground/60">
            déjà affiché
          </span>
        )}
      </div>

      {expanded && canExpand && (
        <div className="ml-6 mt-2 border-l-2 border-border/60 pl-4">
          <CardRow node={entry.child} />
        </div>
      )}
    </div>
  );
}

function RatioBadge({ output }: { output: BuildingOutput }) {
  // "1 → 5" reads as "input_divisor → quantity_per_input": every divisor inputs produce qty outputs.
  return (
    <span className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-xs text-foreground/70">
      {output.input_divisor} → {output.quantity_per_input}
    </span>
  );
}

function ConstraintBadge({ c }: { c: OutputConstraint }) {
  return (
    <span
      title={`Plafonné à ${c.numerator}/${c.denominator} de ${c.constraining_card_title} (portée : ${SCOPE_LABELS[c.scope]})`}
      className="rounded bg-accent-amber/15 px-1.5 py-0.5 text-xs text-accent-amber"
    >
      ⚠ ≤ {c.numerator}/{c.denominator} {c.constraining_card_title} / {SCOPE_LABELS[c.scope]}
    </span>
  );
}

// ---- Icons (inline SVG, theme-driven via currentColor) ---------------------

function CardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-brand-amber">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-brand-amber">
      <path d="M3 21h18" />
      <path d="M5 21V8l7-5 7 5v13" />
      <path d="M10 21v-5h4v5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-foreground/40">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
