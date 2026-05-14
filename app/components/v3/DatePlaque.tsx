/**
 * Left-side date column used in registry/document rows.
 * Day big, month small + tracked, year italic.
 */
export function DatePlaque({
  day,
  month,
  year,
  className = "",
}: {
  day: number | string;
  /** 3-letter French abbrev: Jan, Fév, Mar, Avr, Mai, Jun, Jul, Août, Sep, Oct, Nov, Déc. */
  month: string;
  year: number | string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-3 py-3 ${className}`}
      style={{
        background: "rgba(160,98,42,0.10)",
        borderRight: "1px solid rgba(139,32,32,0.18)",
      }}
    >
      <span
        className="font-serif text-[28px] font-bold leading-none text-parch-ink-soft"
      >
        {day}
      </span>
      <span
        className="font-serif text-[10px] font-bold uppercase mt-1.5"
        style={{ letterSpacing: "0.22em", color: "#7a5028" }}
      >
        {month}
      </span>
      <span
        className="text-xs italic mt-0.5"
        style={{ color: "#9a6e3e" }}
      >
        {year}
      </span>
    </div>
  );
}
