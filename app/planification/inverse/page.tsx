import { getDb } from "@/db";
import { listAllCards } from "@/lib/production-tree/engine";
import InverseClient from "./InverseClient";

/**
 * Reverse planner page (Phase 3).
 * Server-side: prefetch the card list (filtered to "produceable" cards — those
 * for which at least one building has an output row).
 * Client: target picker + qty input + ranked option list.
 */
export default function InversePage() {
  const db = getDb();

  // Restrict the dropdown to cards that are actually produced by some building.
  // Otherwise we'd offer impossible targets like "Influence Andore" that no
  // building can output.
  const producibleIds = new Set(
    (db
      .prepare("SELECT DISTINCT output_card_id FROM building_outputs")
      .all() as Array<{ output_card_id: number }>).map((r) => r.output_card_id)
  );

  const allCards = listAllCards(db);
  const cards = allCards.filter((c) => producibleIds.has(c.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Planificateur inverse</h1>
        <p className="mt-2 text-sm text-foreground/60">
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
