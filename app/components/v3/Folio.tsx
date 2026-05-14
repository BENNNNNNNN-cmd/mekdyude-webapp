import type { ReactNode } from "react";

export function Folio({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative bg-parchment-texture border-2 border-border-stone shadow-[0_8px_24px_rgba(0,0,0,0.5),inset_0_0_60px_rgba(160,98,42,0.1)] ${className}`}
    >
      {children}
    </div>
  );
}

export function FolioHeader({
  title,
  meta,
  className = "",
}: {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3.5 px-5 py-3.5 border-b-2 border-blood ${className}`}
      style={{
        background:
          "linear-gradient(180deg, rgba(160,98,42,0.18), rgba(160,98,42,0.08))",
      }}
    >
      <span className="font-serif text-sm font-extrabold tracking-[0.22em] uppercase text-parch-ink-soft">
        ❦ {title} ❦
      </span>
      <div
        className="flex-1 h-0.5"
        style={{
          background:
            "repeating-linear-gradient(90deg, #8B1A1A 0 6px, transparent 6px 10px)",
        }}
      />
      {meta != null && (
        <div className="font-serif text-xs font-semibold tracking-[0.1em] text-parch-ink-soft">
          {meta}
        </div>
      )}
    </div>
  );
}

export function FolioFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-5 py-3 border-t border-blood/30 font-serif-body text-xs italic tracking-[0.08em] text-parch-muted ${className}`}
      style={{
        background:
          "linear-gradient(180deg, rgba(160,98,42,0.06), rgba(160,98,42,0.02))",
      }}
    >
      {children}
    </div>
  );
}
