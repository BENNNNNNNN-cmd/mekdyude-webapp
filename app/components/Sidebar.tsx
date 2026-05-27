"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { logout } from "@/app/actions/auth";

type NavItem = { href: string; label: string; banner: string };

const navItems: NavItem[] = [
  { href: "/",              label: "Tableau de bord", banner: "/nav-banners/tab_tableau-de-bord.png" },
  { href: "/inventaire",    label: "Inventaire",      banner: "/nav-banners/tab_inventaire.png" },
  { href: "/registre",      label: "Registre",        banner: "/nav-banners/tab_registre.png" },
  { href: "/membres",       label: "Membres du clan", banner: "/nav-banners/tab_membre-du-clan.png" },
  { href: "/domaines",      label: "Domaines",        banner: "/nav-banners/tab_domaines.png" },
  { href: "/documents",     label: "Documents",       banner: "/nav-banners/tab_archives.png" },
  { href: "/planification", label: "Planification",   banner: "/nav-banners/tab_planification.png" },
  { href: "/regles",        label: "Règles",          banner: "/nav-banners/tab_regles-batiments.png" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever we navigate to a new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile hamburger — only shown below md, and hidden while the drawer is open */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        className={`${open ? "hidden" : "flex"} md:hidden fixed top-3 left-3 z-[60] items-center justify-center w-10 h-10 rounded-md cursor-pointer`}
        style={{
          background: "linear-gradient(180deg, #1a0e05, #060200)",
          border: "2px solid #5a3010",
          color: "#f4ead2",
          boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Backdrop behind the drawer on mobile */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`${open ? "block" : "hidden"} md:hidden fixed inset-0 z-40 bg-black/60`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[92px] flex flex-col items-center pt-[18px] gap-2 transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"} md:relative md:inset-y-auto md:z-auto md:translate-x-0 md:shrink-0 md:min-h-screen`}
      style={{
        background: "linear-gradient(180deg, #060200 0%, #1a0e05 100%)",
        borderRight: "2px solid #2a1a08",
        boxShadow: "inset -3px 0 8px rgba(0,0,0,0.7), 4px 0 12px rgba(0,0,0,0.5)",
      }}
    >
      <HeraldShield />

      <nav className="flex flex-col items-center gap-2 mt-1 grow">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className="flex size-[70px] items-center justify-center cursor-pointer transition-[filter] hover:brightness-110"
              style={{
                filter: isActive
                  ? "brightness(1.12) drop-shadow(0 0 10px rgba(200,132,42,0.7))"
                  : "brightness(0.5) saturate(0.78) contrast(0.9)",
              }}
            >
              <Image
                src={item.banner}
                alt=""
                width={70}
                height={70}
                aria-hidden
                className="block max-h-full max-w-full object-contain"
              />
            </Link>
          );
        })}
      </nav>

      <form action={logout} className="mb-3">
        <button
          type="submit"
          title="Déconnexion"
          aria-label="Déconnexion"
          className="flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-[filter] hover:brightness-110"
          style={{
            background:
              "radial-gradient(circle at 35% 35%, #5a3010dd, #5a301088)",
            border: "2px solid #5a3010",
            color: "#f4ead2",
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: 14,
            boxShadow:
              "inset -2px -2px 4px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.3)",
          }}
        >
          <span aria-hidden>⎋</span>
        </button>
      </form>

      {/* Tartan right edge */}
      <div
        aria-hidden
        className="absolute right-0 top-0 bottom-0 w-[3px]"
        style={{
          background:
            "repeating-linear-gradient(180deg, #8B1A1A 0 18px, #1a1008 18px 22px, #A0622A 22px 30px, #1a1008 30px 34px)",
        }}
      />
      </aside>
    </>
  );
}

function HeraldShield() {
  return (
    <div
      className="mb-3"
      style={{ filter: "drop-shadow(0 0 8px rgba(160,98,42,0.4))" }}
    >
      <Image
        src="/images/tab_mekdyude.png"
        alt=""
        width={46}
        height={68}
        aria-hidden
        className="block h-[68px] w-[46px] object-contain"
      />
    </div>
  );
}
