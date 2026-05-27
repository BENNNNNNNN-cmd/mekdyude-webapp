import type { ReactNode } from "react";

/**
 * Stone-plaque stat card — translucent surface on dark stone with 4 heraldic
 * corner brackets in gold. Label in Cinzel 10px, value in Cinzel 32px.
 */
export function StonePlaque({
  label,
  value,
  sub,
  valueColor,
  className = "",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  valueColor?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative px-5 py-4 ${className}`}
      style={{
        background:
          "linear-gradient(180deg, rgba(244,234,210,0.08), rgba(244,234,210,0.02))",
        border: "1px solid rgba(160,98,42,0.4)",
        boxShadow:
          "inset 0 1px 0 rgba(244,234,210,0.06), 0 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      <Bracket pos="tl" />
      <Bracket pos="tr" />
      <Bracket pos="bl" />
      <Bracket pos="br" />
      <div
        className="font-serif text-[10px] font-bold uppercase mb-2 text-gold-light"
        style={{ letterSpacing: "0.22em" }}
      >
        {label}
      </div>
      <div
        className="font-serif text-[32px] font-bold leading-none"
        style={{
          letterSpacing: "0.04em",
          color: valueColor ?? "var(--color-on-body)",
        }}
      >
        {value}
      </div>
      {sub != null && (
        <div className="mt-2 text-xs italic text-on-body-muted">{sub}</div>
      )}
    </div>
  );
}

function Bracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const top = pos.startsWith("t");
  const left = pos.endsWith("l");
  return (
    <span
      aria-hidden
      className="absolute w-1.5 h-1.5"
      style={{
        [top ? "top" : "bottom"]: -1,
        [left ? "left" : "right"]: -1,
        borderTop: top ? "2px solid #A0622A" : undefined,
        borderBottom: !top ? "2px solid #A0622A" : undefined,
        borderLeft: left ? "2px solid #A0622A" : undefined,
        borderRight: !left ? "2px solid #A0622A" : undefined,
      } as React.CSSProperties}
    />
  );
}

export function StonePlaqueGrid({
  children,
  cols = 4,
  className = "",
}: {
  children: ReactNode;
  cols?: number;
  className?: string;
}) {
  // Cards keep a sensible minimum width and wrap to multiple rows on narrow
  // screens, expanding to `cols` across once there's room.
  const minColPx = Math.max(96, Math.round(520 / cols));
  return (
    <div
      className={`grid gap-3.5 mb-5 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minColPx}px, 1fr))` }}
    >
      {children}
    </div>
  );
}
