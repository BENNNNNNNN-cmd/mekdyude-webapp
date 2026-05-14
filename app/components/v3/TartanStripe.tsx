export type TartanKind =
  | "credit"
  | "dette"
  | "loc"
  | "paie"
  | "enca"
  | "neutral";

/** Vertical 4px tartan stripe used as row/card type accent. */
export function TartanStripe({
  kind = "neutral",
  className = "",
}: {
  kind?: TartanKind;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`w-1 h-full tartan-${kind} ${className}`}
    />
  );
}
