"use client";

import { Fragment, useState } from "react";
import type { BuildingTemplate } from "./page";

const costLabels: Record<string, string> = {
  solar: "solar",
  mo: "Main-d'œuvre",
  ressources: "Ressources",
  equipements: "Équipements",
  armements: "Armements",
  macons: "Maçons",
  charpentiers: "Charpentiers",
  forgerons: "Forgerons",
  ingenieurs: "Ingénieurs",
  intendants: "Intendants",
  croyants: "Croyants",
  marins: "Marins",
  scribes: "Scribes",
  laborantins: "Laborantins",
  mentor_mil: "Mentor Mil.",
  mentor_avent: "Mentor Avent.",
  influences_reg: "Influences rég.",
};

const sphereColors: Record<string, string> = {
  "Économique": "bg-emerald-100 text-emerald-800",
  "Arts": "bg-purple-100 text-purple-800",
  "Croyance": "bg-yellow-100 text-yellow-800",
  "Exploration": "bg-sky-100 text-sky-800",
  "Magie": "bg-indigo-100 text-indigo-800",
  "Occulte": "bg-violet-100 text-violet-800",
  "Militaire": "bg-red-100 text-red-800",
  "Fortification": "bg-stone-200 text-stone-800",
  "Maritime": "bg-cyan-100 text-cyan-800",
  "Politique": "bg-amber-100 text-amber-800",
};

export default function ReglesClient({
  buildings,
  spheres,
}: {
  buildings: BuildingTemplate[];
  spheres: string[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = filter === "all" ? buildings : buildings.filter((b) => b.sphere === filter);

  return (
    <div className="space-y-4">
      {/* Sphere filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === "all" ? "bg-sidebar text-white" : "bg-parchment-dark text-foreground/70 hover:bg-parchment-dark/80"
          }`}
        >
          Toutes ({buildings.length})
        </button>
        {spheres.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s ? "bg-sidebar text-white" : `${sphereColors[s] || "bg-gray-100 text-gray-800"} hover:opacity-80`
            }`}
          >
            {s} ({buildings.filter((b) => b.sphere === s).length})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-parchment-dark/50">
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Bâtiment</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Sphère</th>
                <th className="px-4 py-2.5 text-center text-xs uppercase tracking-wider text-foreground/60">Capacité</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Affectation</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Production</th>
                <th className="px-4 py-2.5 text-center text-xs uppercase tracking-wider text-foreground/60">Ratio</th>
                <th className="px-4 py-2.5 text-center text-xs uppercase tracking-wider text-foreground/60">Pts struct.</th>
                <th className="px-4 py-2.5 text-left text-xs uppercase tracking-wider text-foreground/60">Restriction</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <Fragment key={b.id}>
                  <tr
                    className={`cursor-pointer transition-colors ${
                      i % 2 === 0 ? "bg-card" : "bg-parchment/30"
                    } hover:bg-amber-50`}
                    onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  >
                    <td className="px-4 py-2 font-medium">
                      <span className="mr-1 text-foreground/30">{expanded === b.id ? "▾" : "▸"}</span>
                      {b.name}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${sphereColors[b.sphere] || "bg-gray-100"}`}>
                        {b.sphere}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">{b.capacity || "—"}</td>
                    <td className="px-4 py-2 text-foreground/70 text-xs">{b.assignment_type}</td>
                    <td className="px-4 py-2 text-xs">{b.resource_produced}</td>
                    <td className="px-4 py-2 text-center">{b.ratio_per_unit || "—"}</td>
                    <td className="px-4 py-2 text-center">{b.structure_points}</td>
                    <td className="px-4 py-2 text-xs text-foreground/60">
                      {b.domain_limitation || b.prerequisite_building ? (
                        <span>
                          {b.domain_limitation && <span className="block">{b.domain_limitation}</span>}
                          {b.prerequisite_building && <span className="block text-amber-700">Prérequis: {b.prerequisite_building}</span>}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                  {expanded === b.id && (
                    <tr key={`${b.id}-costs`} className="bg-amber-50/50">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                          <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mr-2">Coûts:</span>
                          {Object.entries(b.construction_costs).map(([resource, amount]) => (
                            <span key={resource} className="text-xs">
                              <span className="font-medium">{costLabels[resource] || resource}:</span>{" "}
                              <span className="text-foreground/80">{amount}</span>
                            </span>
                          ))}
                          {b.notes && (
                            <span className="text-xs text-foreground/50 italic ml-4">
                              📝 {b.notes}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
