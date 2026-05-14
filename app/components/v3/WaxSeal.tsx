import type { ButtonHTMLAttributes, ReactNode } from "react";

export type WaxSealIntent = "confirm" | "destroy" | "neutral" | "info";

const INTENT_COLOR: Record<WaxSealIntent, string> = {
  confirm: "#3d6e2a", // green — régler / valider
  destroy: "#8B1A1A", // blood — annuler / supprimer
  neutral: "#5a3010", // brown — modifier / renommer
  info: "#A0622A",    // gold — info / télécharger
};

/**
 * Wax seal — circular embossed action button. Size 30–110 px. Intent maps to
 * a semantic color (confirm/destroy/neutral/info). Renders as <button> by
 * default; pass `as="div"` for non-interactive display (e.g. mime seals).
 */
export function WaxSeal({
  intent = "neutral",
  size = 30,
  children,
  className = "",
  ...rest
}: {
  intent?: WaxSealIntent;
  size?: number;
  children: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const color = INTENT_COLOR[intent];
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center rounded-full cursor-pointer transition-[filter] hover:brightness-110 active:scale-95 ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}dd, ${color}88)`,
        border: `2px solid ${color}`,
        color: "#f4ead2",
        fontFamily: "var(--font-serif)",
        fontWeight: 700,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        boxShadow:
          "inset -2px -2px 4px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.3)",
        ...(rest.style ?? {}),
      }}
    >
      {children}
    </button>
  );
}

/** Non-interactive seal — same visual, no button semantics (e.g. file-type tag). */
export function WaxSealStatic({
  intent = "neutral",
  size = 44,
  color,
  children,
  className = "",
}: {
  intent?: WaxSealIntent;
  size?: number;
  /** Override intent's preset color with an arbitrary hex (used for category-specific seals). */
  color?: string;
  children: ReactNode;
  className?: string;
}) {
  const c = color ?? INTENT_COLOR[intent];
  return (
    <div
      className={`inline-flex items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 35%, ${c}dd, ${c}88)`,
        border: `2px solid ${c}`,
        color: "#f4ead2",
        fontFamily: "var(--font-serif)",
        fontWeight: 700,
        fontSize: Math.max(10, Math.round(size * 0.28)),
        boxShadow:
          "inset -2px -2px 4px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.3)",
      }}
    >
      {children}
    </div>
  );
}
