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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeSubs, setIncludeSubs] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const [tree, setTree] = useState<CardNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inflight = useRef<AbortController | null>(null);

  const fetchTree = useCallback(
    async (cardId: string, withSubs: boolean, withOverlay: boolean) => {
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          card: cardId,
          substitutes: withSubs ? "1" : "0",
          overlay: withOverlay ? "1" : "0",
        });
        const res = await fetch(`/api/production-tree?${params}`, {
          signal: controller.signal,
        });
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
    },
    []
  );

  function handleCardChange(id: string | null) {
    setSelectedId(id);
    if (id == null) {
      inflight.current?.abort();
      setTree(null);
      setError(null);
      setLoading(false);
      return;
    }
    void fetchTree(id, includeSubs, overlay);
  }

  function handleSubsToggle(next: boolean) {
    setIncludeSubs(next);
    if (selectedId != null) void fetchTree(selectedId, next, overlay);
  }

  function handleOverlayToggle(next: boolean) {
    setOverlay(next);
    if (selectedId != null) void fetchTree(selectedId, includeSubs, next);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <CardPicker
          cards={cards}
          value={selectedId}
          onChange={handleCardChange}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground/80">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={overlay}
              onChange={(e) => handleOverlayToggle(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-brand-amber"
            />
            <span className="font-medium">Avec mon état</span>
            <span className="text-xs text-foreground/50">
              (✓ construit / ⚠ constructible / ✗ bloqué)
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeSubs}
              onChange={(e) => handleSubsToggle(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-brand-amber"
            />
            Inclure les substituts
            <span className="text-xs text-foreground/50">
              (Paysan / Forestier / Marin / Nomade / Peau verte / Voelhoorn / Esclave / Homme-bête)
            </span>
          </label>
        </div>
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
