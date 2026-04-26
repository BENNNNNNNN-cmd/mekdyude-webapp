/**
 * Planification section layout — wraps Phase 1 (Arbre de production) and
 * Phase 3 (Planificateur inverse) under one nav umbrella.
 */
export default function PlanificationLayout({ children }: { children: React.ReactNode }) {
  return <div className="max-w-7xl mx-auto">{children}</div>;
}
