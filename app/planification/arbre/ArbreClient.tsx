"use client";

import { useCallback, useRef, useState } from "react";
import type { Card, CardNode } from "@/lib/production-tree/types";
import CardPicker from "@/app/components/planification/CardPicker";
import TreeNode from "@/app/components/planification/TreeNode";

/**
 * Client surface for the Arbre de production page.
 * Owns: selected card, "include substitutes" toggle, fetched tree.
 *
 * Fetches happen inside event handlers (not effects) — there's no external
 * subscription to synchronize, just user-initiated lookups. Each new lookup
 * cancels the previous one via AbortController.
 */
export default function ArbreClient({ cards }: { cards: Card[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [includeSubs, setIncludeSubs] = useState(false);
  const [tree, setTree] = useState<CardNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflight = useRef<AbortController | null>(null);

  const fetchTree = useCallback(async (cardId: number, withSubs: boolean) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/production-tree?card=${cardId}&substitutes=${withSubs ? 1 : 0}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CardNode = await res.json();
      if (controller.signal.aborted) return;
      setTree(data);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  function handleCardChange(id: number | null) {
    setSelectedId(id);
    if (id == null) {
      inflight.current?.abort();
      setTree(null);
      setError(null);
      setLoading(false);
      return;
    }
    void fetchTree(id, includeSubs);
  }

  function handleSubsToggle(next: boolean) {
    setIncludeSubs(next);
    if (selectedId != null) void fetchTree(selectedId, next);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <CardPicker
          cards={cards}
          value={selectedId}
          onChange={handleCardChange}
        />

        <label className="mt-4 flex items-center gap-2 text-sm text-foreground/80">
          <input
            type="checkbox"
            checked={includeSubs}
            onChange={(e) => handleSubsToggle(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-brand-amber"
          />
          Inclure les substituts
          <span className="text-xs text-foreground/50">
            (Esclave / Forestier / Marin / Nomade / Paysan / Peau verte / Voelhoorn / Homme-bête sont interchangeables)
          </span>
        </label>
      </div>

      {selectedId == null && (
        <p className="rounded-lg border border-dashed border-border/60 bg-card/40 p-6 text-center text-sm italic text-foreground/50">
          Choisissez une carte ci-dessus pour afficher sa chaîne de production.
        </p>
      )}

      {loading && (
        <p className="rounded-lg border border-border bg-card/60 p-4 text-sm text-foreground/70">
          Calcul de l&apos;arbre…
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-accent-red/50 bg-accent-red/10 p-4 text-sm text-accent-red">
          Erreur : {error}
        </p>
      )}

      {tree && !loading && selectedId != null && <TreeNode node={tree} />}
    </div>
  );
}
