"use client";

import { useCallback, useRef, useState } from "react";
import type { Card, CardNode } from "@/lib/production-tree/types";
import CardPicker from "@/app/components/planification/CardPicker";
import TreeNode from "@/app/components/planification/TreeNode";

const FETCH_TIMEOUT_MS = 15000;

interface TreeFetchResult {
  tree: CardNode;
  overlayStatus: string | null;
}

interface ApiErrorPayload {
  error?: string;
  correlationId?: string;
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === "object" && value !== null && "error" in value;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchTreeOnce(
  cardId: string,
  withSubs: boolean,
  withOverlay: boolean,
  signal: AbortSignal
): Promise<TreeFetchResult> {
  const params = new URLSearchParams({
    card: cardId,
    substitutes: withSubs ? "1" : "0",
    overlay: withOverlay ? "1" : "0",
  });

  const res = await fetch(`/api/production-tree?${params}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      res.status === 401
        ? "Session expirée. Reconnectez-vous, puis réessayez."
        : `Réponse inattendue du serveur (${res.status}).`
    );
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new Error("Réponse JSON invalide du serveur.");
  }

  if (!res.ok) {
    const message = isApiErrorPayload(payload) && payload.error ? payload.error : `HTTP ${res.status}`;
    const suffix =
      isApiErrorPayload(payload) && payload.correlationId
        ? ` (${payload.correlationId})`
        : "";
    throw new Error(`${message}${suffix}`);
  }

  return {
    tree: payload as CardNode,
    overlayStatus: res.headers.get("x-production-tree-overlay"),
  };
}

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
  const [warning, setWarning] = useState<string | null>(null);

  const inflight = useRef<AbortController | null>(null);
  const showTree = tree !== null && !loading && selectedId !== null;
  const selectedTreeIsEmpty = showTree && tree.buildings.length === 0;

  const fetchTree = useCallback(
    async (cardId: string, withSubs: boolean, withOverlay: boolean) => {
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;

      setLoading(true);
      setError(null);
      setWarning(null);
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, FETCH_TIMEOUT_MS);

      try {
        let result: TreeFetchResult;
        try {
          result = await fetchTreeOnce(cardId, withSubs, withOverlay, controller.signal);
        } catch (firstError) {
          if (!withOverlay || controller.signal.aborted) throw firstError;

          result = await fetchTreeOnce(cardId, withSubs, false, controller.signal);
          if (!controller.signal.aborted) {
            setWarning("L'état Mek Dyude est indisponible; arbre générique affiché.");
          }
        }

        if (controller.signal.aborted) return;
        setTree(result.tree);
        if (withOverlay && result.overlayStatus === "fallback") {
          setWarning("L'état Mek Dyude est indisponible; arbre générique affiché.");
        }
      } catch (e: unknown) {
        if (isAbortError(e)) {
          if (timedOut) setError("Délai d'attente dépassé. Réessayez dans un instant.");
          return;
        }
        setTree(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        window.clearTimeout(timeoutId);
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
      setWarning(null);
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
        <p className="rounded-lg border border-white/20 bg-black/35 p-6 text-center text-sm italic text-white/80 shadow-sm">
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

      {warning && !error && (
        <p className="rounded-lg border border-accent-amber/50 bg-accent-amber/10 p-4 text-sm text-accent-amber">
          {warning}
        </p>
      )}

      {selectedTreeIsEmpty && tree && (
        <p className="rounded-lg border border-dashed border-border/60 bg-card/40 p-6 text-center text-sm italic text-foreground/50">
          Aucun bâtiment ne consomme {tree.card.title}.
        </p>
      )}

      {showTree && !selectedTreeIsEmpty && tree && <TreeNode node={tree} />}
    </div>
  );
}
