"use client";

const categoryConfig: Record<
  string,
  { label: string; bg: string; text: string; darkBg: string; darkText: string }
> = {
  regles: {
    label: "Regles",
    bg: "#FCEBEB",
    text: "#A32D2D",
    darkBg: "rgba(163, 45, 45, 0.25)",
    darkText: "#e87c7c",
  },
  strategie: {
    label: "Strategie",
    bg: "#EEEDFE",
    text: "#534AB7",
    darkBg: "rgba(83, 74, 183, 0.25)",
    darkText: "#a39ef0",
  },
  inventaires: {
    label: "Inventaires",
    bg: "#EAF3DE",
    text: "#3B6D11",
    darkBg: "rgba(59, 109, 17, 0.25)",
    darkText: "#7fbf48",
  },
  cartes: {
    label: "Cartes & Images",
    bg: "#FAEEDA",
    text: "#854F0B",
    darkBg: "rgba(133, 79, 11, 0.25)",
    darkText: "#d4a054",
  },
  general: {
    label: "General",
    bg: "#F1EFE8",
    text: "#5F5E5A",
    darkBg: "rgba(95, 94, 90, 0.25)",
    darkText: "#a8a69f",
  },
};

export function getCategoryConfig(category: string) {
  return categoryConfig[category] || categoryConfig.general;
}

export function getCategoryLabel(category: string): string {
  return getCategoryConfig(category).label;
}

export default function CategoryBadge({ category }: { category: string }) {
  const config = getCategoryConfig(category);

  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
      style={
        {
          backgroundColor: `var(--cat-bg, ${config.bg})`,
          color: `var(--cat-text, ${config.text})`,
          "--cat-bg": config.bg,
          "--cat-text": config.text,
        } as React.CSSProperties
      }
    >
      <span className="dark:hidden">{config.label}</span>
      <span
        className="hidden dark:inline"
        style={{ color: config.darkText }}
      >
        {config.label}
      </span>
    </span>
  );
}
