"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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

  return (
    <aside
      className="relative w-[92px] shrink-0 min-h-screen flex flex-col items-center pt-[18px] gap-2"
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
  );
}

function HeraldShield() {
  return (
    <div
      className="mb-3"
      style={{ filter: "drop-shadow(0 0 8px rgba(160,98,42,0.4))" }}
    >
      <Image
        src="/images/Banner_MekDyude.png"
        alt=""
        width={46}
        height={68}
        aria-hidden
        className="block h-[68px] w-[46px] object-contain"
      />
    </div>
  );
}
