import { ensureReferenceMigration } from "@/db";
import ScrollToTopButton from "@/app/components/ScrollToTopButton";
import { listAllCards } from "@/lib/production-tree/engine";
import ArbreClient from "./ArbreClient";

// Reference data is fetched live from Postgres each request (5-min TTL cache
// in lib/reference-postgres.ts). Force per-request rendering so we don't
// prerender against stale snapshots at build time.
export const dynamic = "force-dynamic";

/**
 * Production tree page (Phase 1).
 * Server-side: prefetch the card list for the picker.
 * Client: handles selection + tree fetch + rendering.
 */
export default async function ArbrePage() {
  await ensureReferenceMigration();
  const cards = await listAllCards();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Arbre de production</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Sélectionnez une carte ci-dessous pour voir tous les bâtiments qui l&apos;acceptent
          comme intrant, leurs outputs, et la chaîne complète qui en découle.
        </p>
      </div>

      <Legend />

      <ArbreClient cards={cards} />

      <ScrollToTopButton />
    </div>
  );
}

function Legend() {
  return (
    <details className="rounded-lg border border-border bg-card/60 p-4 text-sm">
      <summary className="cursor-pointer font-semibold text-foreground">
        Comment lire l&apos;arbre
      </summary>
      <div className="mt-3 space-y-2 text-foreground/80">
        <p>
          <span className="font-mono text-brand-amber">Carte</span> — une ressource ou unité
          utilisée comme intrant dans la chaîne.
        </p>
        <p>
          <span className="font-mono text-brand-amber">Bâtiment</span> — bâtiment qui accepte la
          carte parente comme intrant. Affiche sa capacité maximale.
        </p>
        <p>
          <span className="font-mono text-brand-amber">Output</span> — ce que le bâtiment produit.
          Le ratio se lit <em>« diviseur d&apos;intrant → quantité par intrant »</em>
          (ex. <code>1 → 5</code> = 1 carte d&apos;intrant produit 5 cartes de sortie).
        </p>
        <p>
          <span className="rounded bg-accent-green/20 px-1.5 py-0.5 text-xs text-accent-green">
            +N pleine capacité
          </span>{" "}
          — bonus produit uniquement quand le bâtiment est rempli au maximum.
        </p>
        <p>
          <span className="rounded bg-accent-amber/20 px-1.5 py-0.5 text-xs text-accent-amber">
            ⚠ contrainte
          </span>{" "}
          — l&apos;output est plafonné par le ratio d&apos;une autre carte (portée :
          domaine / fief / province / région).
        </p>
        <p>
          <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs italic">
            déjà affiché
          </span>{" "}
          — la carte apparaît déjà plus haut dans cette branche ; étendre créerait une boucle.
        </p>
      </div>
    </details>
  );
}
