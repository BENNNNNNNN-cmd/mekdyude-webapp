"use client";

import { useCallback, useRef, useState } from "react";
import type { Card } from "@/lib/production-tree/types";
import type { ReversePlan } from "@/lib/production-tree/reverse-options";
import CardPicker from "@/app/components/planification/CardPicker";
import OptionCard from "@/app/components/planification/OptionCard";

const DEFAULT_QTY = 50;

export default function InverseClient({ cards }: { cards: Card[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(DEFAULT_QTY);
  const [plan, setPlan] = useState<ReversePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflight = useRef<AbortController | null>(null);

  const fetchPlan = useCallback(async (cardId: string, q: number) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/production-tree/reverse?card=${encodeURIComponent(cardId)}&qty=${q}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ReversePlan = await res.json();
      if (controller.signal.aborted) return;
      setPlan(data);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  function handleCardChange(id: string | null) {
    setSelectedId(id);
    if (id == null) {
      inflight.current?.abort();
      setPlan(null);
      setError(null);
      setLoading(false);
      return;
    }
    void fetchPlan(id, qty);
  }

  function handleQtyChange(next: number) {
    setQty(next);
    if (selectedId != null && next > 0) void fetchPlan(selectedId, next);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <CardPicker cards={cards} value={selectedId} onChange={handleCardChange} />

        <div className="mt-4 flex items-end gap-3">
          <div>
            <label
              htmlFor="qty-input"
              className="block text-sm font-medium text-foreground"
            >
              Quantité visée par année
            </label>
            <input
              id="qty-input"
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => handleQtyChange(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-32 rounded-lg border border-border bg-card px-3 py-2 text-foreground shadow-sm focus:border-brand-amber focus:outline-none focus:ring-2 focus:ring-brand-amber/30"
            />
          </div>
        </div>
      </div>

      {selectedId == null && (
        <p className="rounded-lg border border-white/20 bg-black/35 p-6 text-center text-sm italic text-white/80 shadow-sm">
          Choisissez une carte cible ci-dessus pour générer un plan.
        </p>
      )}

      {loading && (
        <p className="rounded-lg border border-border bg-card/60 p-4 text-sm text-foreground/70">
          Calcul du plan…
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-accent-red/50 bg-accent-red/10 p-4 text-sm text-accent-red">
          Erreur : {error}
        </p>
      )}

      {plan && !loading && selectedId != null && <PlanResult plan={plan} />}
    </div>
  );
}

function PlanResult({ plan }: { plan: ReversePlan }) {
  const surplus = plan.gap === 0 && plan.baseline.current_production >= plan.target.needed_qty;

  // Partition options by actionability
  const actionable = plan.options.filter(
    (o) => o.kind !== "build_new" || o.blocked_reasons.length === 0
  );
  const blocked = plan.options.filter(
    (o) => o.kind === "build_new" && o.blocked_reasons.length > 0
  );

  return (
    <div className="space-y-5">
      <BaselineSummary plan={plan} surplus={surplus} />

      {plan.unreachable_producers.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-foreground/60">
          <span className="font-semibold">Bâtiments producteurs non listés :</span>{" "}
          {plan.unreachable_producers.join(", ")} — aucune option applicable (vous ne possédez
          aucun domaine où le construire ou le staffer).
        </div>
      )}

      {!surplus && actionable.length > 0 && (
        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Options actionables ({actionable.length})
          </h2>
          <div className="mt-3 space-y-3">
            {actionable.map((opt) => (
              <OptionCard key={opt.id} option={opt} gap={plan.gap} />
            ))}
          </div>
        </section>
      )}

      {blocked.length > 0 && (
        <section>
          <h2 className="font-serif text-lg font-semibold text-foreground/70">
            Options bloquées ({blocked.length})
          </h2>
          <p className="text-xs text-foreground/50">
            Listées pour référence — non actionables dans l&apos;état actuel.
          </p>
          <div className="mt-3 space-y-3">
            {blocked.map((opt) => (
              <OptionCard key={opt.id} option={opt} gap={plan.gap} />
            ))}
          </div>
        </section>
      )}

      {!surplus && plan.options.length === 0 && (
        <p className="rounded-lg border border-dashed border-border/60 bg-card/40 p-6 text-center text-sm italic text-foreground/60">
          Aucun bâtiment ne produit cette carte dans la base de règles.
        </p>
      )}
    </div>
  );
}

function BaselineSummary({ plan, surplus }: { plan: ReversePlan; surplus: boolean }) {
  const { target, baseline, gap } = plan;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-foreground/50">Cible</div>
          <div className="font-serif text-2xl font-bold text-foreground">
            {target.needed_qty} <span className="text-base font-normal">{target.card_title}</span>
            <span className="text-sm font-normal text-foreground/50"> / an</span>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-foreground/50">
            Production actuelle
          </div>
          <div className="font-serif text-2xl font-bold text-foreground">
            {baseline.current_production}
            <span className="text-sm font-normal text-foreground/50"> / an</span>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-foreground/50">Écart</div>
          <div
            className={`font-serif text-2xl font-bold ${
              surplus ? "text-accent-green" : "text-accent-amber"
            }`}
          >
            {surplus ? `+${baseline.current_production - target.needed_qty}` : `−${gap}`}
          </div>
        </div>
      </div>

      {baseline.breakdown.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-foreground/70 hover:text-foreground">
            Détail de la production actuelle ({baseline.breakdown.length} sources)
          </summary>
          <ul className="mt-2 space-y-1 pl-4 text-foreground/80">
            {baseline.breakdown.map((b, i) => (
              <li key={i}>
                {b.domain_name} · {b.building_name} —{" "}
                <span className="font-mono">
                  {b.assigned}/{b.capacity}
                </span>{" "}
                → <span className="font-semibold">{b.amount}/an</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {surplus && (
        <p className="mt-3 rounded-lg bg-accent-green/10 px-3 py-2 text-sm text-accent-green">
          ✓ Vous produisez déjà assez. Les options ci-dessous sont des excédents potentiels.
        </p>
      )}
    </div>
  );
}
