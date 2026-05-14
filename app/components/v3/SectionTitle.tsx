import type { ReactNode } from "react";

/**
 * Top-of-section title used between Banner and folios.
 * Cinzel 16px gold-light with a fading gold underline.
 */
export function SectionTitle({
  children,
  meta,
  className = "",
}: {
  children: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 mb-4 ${className}`}>
      <h2
        className="font-serif text-base font-extrabold uppercase text-gold-light pb-1 grow"
        style={{
          letterSpacing: "0.22em",
          borderBottom: "2px solid",
          borderImage:
            "linear-gradient(90deg, #A0622A, transparent) 1",
        }}
      >
        {children}
      </h2>
      {meta != null && (
        <span className="text-xs italic text-on-body-soft shrink-0">
          {meta}
        </span>
      )}
    </div>
  );
}
