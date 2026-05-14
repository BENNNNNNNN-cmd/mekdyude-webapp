import type { ReactNode } from "react";

/**
 * In-folio section divider with dashed gradient line.
 * Used to break a folio into sub-sections (e.g. "❦ Cette semaine ❦").
 */
export function DayHeader({
  label,
  meta,
  className = "",
}: {
  label: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3.5 px-5 py-3 border-y-2 border-blood ${className}`}
      style={{
        background:
          "linear-gradient(180deg, rgba(160,98,42,0.18), rgba(160,98,42,0.08))",
      }}
    >
      <span
        className="font-serif text-sm font-extrabold uppercase text-parch-ink-soft"
        style={{ letterSpacing: "0.26em" }}
      >
        ❦ {label} ❦
      </span>
      <div
        className="flex-1 h-0.5"
        style={{
          background:
            "repeating-linear-gradient(90deg, #8B1A1A 0 6px, transparent 6px 10px)",
        }}
      />
      {meta != null && (
        <span
          className="font-serif text-xs font-semibold text-parch-ink-soft"
          style={{ letterSpacing: "0.1em" }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}
