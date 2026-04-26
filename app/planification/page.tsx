import Link from "next/link";

/**
 * Planification landing page — directs to the available tools.
 */
export default function PlanificationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Planification</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Outils de planification de production basés sur les règles du Duché de Bicolline.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/planification/arbre"
          className="block rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md hover:border-brand-amber"
        >
          <h2 className="font-serif text-xl font-semibold text-foreground">Arbre de production</h2>
          <p className="mt-2 text-sm text-foreground/70">
            Sélectionnez une carte (ressource ou unité) et explorez la chaîne de production
            qui en découle. Quels bâtiments la consomment, quels outputs ils produisent,
            et ainsi de suite récursivement.
          </p>
          <p className="mt-3 text-xs text-foreground/50">Phase 1 — disponible</p>
        </Link>

        <div className="block rounded-xl border border-border/60 bg-card/40 p-5 shadow-sm opacity-60">
          <h2 className="font-serif text-xl font-semibold text-foreground">Planificateur inverse</h2>
          <p className="mt-2 text-sm text-foreground/70">
            « J&apos;ai besoin de 50 Équipement par an — montrez-moi comment y arriver. »
            Recherche inversée à partir d&apos;une cible : bâtiments à construire,
            staffing requis, coûts, options classées.
          </p>
          <p className="mt-3 text-xs text-foreground/50">Phase 3 — à venir</p>
        </div>
      </div>
    </div>
  );
}
