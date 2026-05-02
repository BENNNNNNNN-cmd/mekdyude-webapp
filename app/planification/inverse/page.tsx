import { ensureReferenceMigration } from "@/db";
import { loadRepo } from "@/lib/production-tree/engine";
import InverseClient from "./InverseClient";

export const dynamic = "force-dynamic";

/**
 * Reverse planner page (Phase 3).
 * Server-side: prefetch the card list (filtered to "produceable" cards — those
 * that some building's outputs include).
 * Client: target picker + qty input + ranked option list.
 */
export default async function InversePage() {
  await ensureReferenceMigration();
  const repo = await loadRepo();
  const allCards = repo.listCards();
  const producibleIds = new Set<string>();
  for (const card of allCards) {
    if (repo.buildingsProducing(card.id).length > 0) producibleIds.add(card.id);
  }
  const cards = allCards.filter((c) => producibleIds.has(c.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-white">Planificateur inverse</h1>
        <p className="mt-2 text-sm text-white/80">
          Indiquez ce dont vous avez besoin par année. Le planificateur calcule l&apos;écart vs
          votre production actuelle et propose des options classées : staffer un bâtiment
          existant, ou en construire un nouveau — avec coûts, contraintes, et chaîne amont.
        </p>
      </div>

      <Legend />

      <InverseClient cards={cards} />
    </div>
  );
}

function Legend() {
  return (
    <details className="rounded-lg border border-border bg-card/60 p-4 text-sm">
      <summary className="cursor-pointer font-semibold text-foreground">
        Comment lire le résultat
      </summary>
      <div className="mt-3 space-y-2 text-foreground/80">
        <p>
          <span className="font-semibold">Écart</span> — quantité manquante par rapport à votre
          production actuelle.
        </p>
        <p>
          <span className="rounded bg-accent-green/15 px-1.5 py-0.5 text-xs text-accent-green">
            Staffer
          </span>{" "}
          — option la plus simple : assigner plus d&apos;unités à un bâtiment existant
          sous-staffé.
        </p>
        <p>
          <span className="rounded bg-brand-amber/15 px-1.5 py-0.5 text-xs text-brand-amber">
            Construire
          </span>{" "}
          — option plus coûteuse : nouveau bâtiment sur un domaine. Les coûts de construction
          sont comparés à votre inventaire actuel.
        </p>
        <p>
          <span className="rounded bg-accent-red/15 px-1.5 py-0.5 text-xs text-accent-red">
            Bloqué
          </span>{" "}
          — l&apos;option ne peut pas être exécutée maintenant (slot, prérequis, type de
          production, gisement, ressources). Affiché en bas de la liste pour référence.
        </p>
        <p>
          <span className="font-semibold">Demande amont</span> — chaque option crée une demande
          en intrants (ex. staffer une Forge requiert plus de Paysans). Le planificateur indique
          si votre production actuelle peut absorber cette demande.
        </p>
      </div>
    </details>
  );
}
