import type { ReactNode } from "react";

/**
 * Filled badge (type chip) — Cinzel 9px, parchment text on colored background,
 * embossed by inset highlight/shadow. Color is a CSS color string.
 */
export function Badge({
  color,
  children,
  className = "",
}: {
  color: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block font-serif text-[9px] font-extrabold uppercase px-2 py-[3px] text-on-body align-middle ${className}`}
      style={{
        background: color,
        letterSpacing: "0.20em",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.2)",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Outlined badge (status chip) — Cinzel 9px, colored text on tinted background
 * with a matching 1px border.
 */
export function OutlinedBadge({
  color,
  children,
  className = "",
}: {
  color: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-block font-serif text-[9px] font-extrabold uppercase px-2 py-[2px] align-middle ${className}`}
      style={{
        color,
        border: `1px solid ${color}`,
        background: `${color}12`,
        letterSpacing: "0.16em",
      }}
    >
      {children}
    </span>
  );
}
