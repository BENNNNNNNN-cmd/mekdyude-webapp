"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const navItems = [
  {
    href: "/",
    label: "Tableau de bord",
    // Shield / Bouclier héraldique
    paths: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  },
  {
    href: "/domaines",
    label: "Domaines",
    // Castle / Château avec créneaux
    paths: [
      "M3 21h18",
      "M5 21V11l2-2V6h2V4h2v2h2V4h2v2h2v3l2 2v10",
      "M10 21v-5h4v5",
    ],
  },
  {
    href: "/inventaire",
    label: "Inventaire",
    // Treasure chest / Coffre au trésor
    paths: [
      "M6 7h12l2 5H4l2-5z",
      "M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7",
      "M12 12v2.5",
      "M10.5 14.5h3",
    ],
  },
  {
    href: "/regles",
    label: "Règles",
    // Scroll / Parchemin
    paths: [
      "M6 4h13v13a4 4 0 01-4 4H6V4z",
      "M19 4v10",
      "M9 9h6",
      "M9 13h4",
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className={`min-h-screen bg-sidebar text-white flex flex-col shrink-0 transition-all duration-300 ${
        expanded ? "w-64" : "w-16"
      }`}
    >
      {/* Guild Header */}
      <div className={`border-b border-white/10 ${expanded ? "p-5" : "p-3 flex justify-center"}`}>
        <div className={`flex items-center ${expanded ? "gap-3 mb-1" : "justify-center"}`}>
          <Image
            src="/images/logo.svg"
            alt="Mek Dyude"
            width={expanded ? 48 : 32}
            height={expanded ? 48 : 32}
            className="shrink-0 drop-shadow-lg"
          />
          {expanded && (
            <div>
              <h1 className="font-serif text-xl font-bold tracking-wide text-brand-amber">Mek Dyude</h1>
              <p className="text-xs text-white/40">Duché de Bicolline</p>
            </div>
          )}
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mx-auto my-2 flex items-center justify-center w-8 h-8 rounded-lg text-white/50 hover:bg-sidebar-hover hover:text-white transition-colors"
        title={expanded ? "Réduire" : "Étendre"}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={expanded ? "M15.75 19.5L8.25 12l7.5-7.5" : "M8.25 4.5l7.5 7.5-7.5 7.5"}
          />
        </svg>
      </button>

      {/* Navigation */}
      <nav className={`flex-1 space-y-1 ${expanded ? "p-4" : "px-2 py-4"}`}>
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!expanded ? item.label : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                expanded ? "gap-3 px-4 py-2.5" : "justify-center px-2 py-2.5"
              } ${
                isActive
                  ? "bg-brand-amber text-white shadow-md"
                  : "text-white/70 hover:bg-sidebar-hover hover:text-white"
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {item.paths.map((d, i) => (
                  <path key={i} strokeLinecap="round" strokeLinejoin="round" d={d} />
                ))}
              </svg>
              {expanded && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Tartan accent strip */}
      <div className="h-2 bg-gradient-to-r from-tartan-red via-tartan-gold to-tartan-red" />

      {/* Footer */}
      <div className={`space-y-2 ${expanded ? "p-4" : "p-2"}`}>
        <form action={logout}>
          <button
            type="submit"
            title={!expanded ? "Déconnexion" : undefined}
            className={`flex items-center w-full rounded-lg text-sm text-white/50 hover:bg-sidebar-hover hover:text-white transition-colors ${
              expanded ? "gap-2 px-4 py-2" : "justify-center px-2 py-2"
            }`}
          >
            {/* Portcullis / Herse */}
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h18v4l-2 2v12M5 9v12M9 9v12M13 9v12M17 9v12M3 7h18M5 12h12M5 16h12" />
            </svg>
            {expanded && "Déconnexion"}
          </button>
        </form>
        {expanded && <p className="text-xs text-white/30">Bicolline Manager v0.1</p>}
      </div>
    </aside>
  );
}
