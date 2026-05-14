import type { ReactNode } from "react";

/**
 * Page banner — dark stone gradient with blood-red top/bottom borders and
 * two decorative gold-tartan edge stripes. Title in Cinzel 900, subtitle in
 * EB Garamond italic wrapped in fleur-de-lys.
 */
export function Banner({
  title,
  sub,
  actions,
  className = "",
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative flex items-center justify-between px-7 py-5 mb-5 border-2 border-border-stone border-t-blood border-b-blood ${className}`}
      style={{
        background: "linear-gradient(180deg, #1a0e05 0%, #2a1a08 100%)",
        borderTopWidth: "4px",
        borderBottomWidth: "4px",
        boxShadow:
          "0 4px 16px rgba(0,0,0,0.5), inset 0 0 20px rgba(160,98,42,0.08)",
      }}
    >
      <EdgeStripe placement="top" />
      <div>
        <h1
          className="font-serif font-black text-3xl uppercase leading-none text-on-body"
          style={{
            letterSpacing: "0.18em",
            textShadow: "0 2px 0 #000, 0 0 20px rgba(160,98,42,0.3)",
          }}
        >
          {title}
        </h1>
        {sub != null && (
          <p
            className="mt-2 text-sm italic text-on-body-soft"
            style={{ letterSpacing: "0.04em" }}
          >
            ⚜ {sub} ⚜
          </p>
        )}
      </div>
      {actions != null && <div className="flex items-center gap-2.5">{actions}</div>}
      <EdgeStripe placement="bottom" />
    </div>
  );
}

function EdgeStripe({ placement }: { placement: "top" | "bottom" }) {
  return (
    <div
      className="absolute left-0 right-0 h-[3px] pointer-events-none"
      style={{
        [placement]: "-3px",
        background:
          "repeating-linear-gradient(90deg, #A0622A 0 12px, #1a1008 12px 14px)",
      } as React.CSSProperties}
    />
  );
}

/** Primary CTA — blood-red gradient with chevron clip-path. */
export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`font-serif text-xs font-extrabold uppercase text-on-body px-5 py-3 cursor-pointer transition-[filter] hover:brightness-110 ${props.className ?? ""}`}
      style={{
        background: "linear-gradient(180deg, #c8242a, #6e1414)",
        border: "2px solid #4a0a0a",
        letterSpacing: "0.2em",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 8px rgba(0,0,0,0.5)",
        clipPath: "polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)",
        ...(props.style ?? {}),
      }}
    >
      {children}
    </button>
  );
}

/** Ghost CTA — outlined, neutral hover. */
export function GhostButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`font-serif text-[11px] font-semibold uppercase px-4 py-2.5 cursor-pointer transition-colors ${props.className ?? ""}`}
      style={{
        background: "transparent",
        color: "rgba(244,234,210,0.8)",
        border: "1px solid rgba(160,98,42,0.5)",
        letterSpacing: "0.16em",
        ...(props.style ?? {}),
      }}
    >
      {children}
    </button>
  );
}
