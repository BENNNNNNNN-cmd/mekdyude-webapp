"use client";

import { OutlinedBadge } from "@/app/components/v3/Badge";

interface CategoryConfig {
  label: string;
  color: string;
  tartan: string;
}

const categoryConfig: Record<string, CategoryConfig> = {
  regles: {
    label: "Règles",
    color: "#8B1A1A",
    tartan:
      "repeating-linear-gradient(180deg, #8B1A1A 0 8px, #4a0a0a 8px 12px, #c84040 12px 18px)",
  },
  strategie: {
    label: "Stratégie",
    color: "#5a3010",
    tartan:
      "repeating-linear-gradient(180deg, #5a3010 0 8px, #2a1a08 8px 12px, #8B1A1A 12px 18px)",
  },
  inventaires: {
    label: "Inventaires",
    color: "#A0622A",
    tartan:
      "repeating-linear-gradient(180deg, #A0622A 0 8px, #5a3010 8px 12px, #c8842a 12px 18px)",
  },
  cartes: {
    label: "Cartes",
    color: "#1a3868",
    tartan:
      "repeating-linear-gradient(180deg, #1a3868 0 8px, #0a1a3a 8px 12px, #3a5898 12px 18px)",
  },
  general: {
    label: "Général",
    color: "#3d6e2a",
    tartan:
      "repeating-linear-gradient(180deg, #3d6e2a 0 8px, #1a3010 8px 12px, #5a8a3a 12px 18px)",
  },
};

export function getCategoryConfig(category: string): CategoryConfig {
  return categoryConfig[category] || categoryConfig.general;
}

export function getCategoryLabel(category: string): string {
  if (categoryConfig[category]) return categoryConfig[category].label;
  // Custom category: capitalize first letter
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function getCategoryTartan(category: string): string {
  return getCategoryConfig(category).tartan;
}

export default function CategoryBadge({ category }: { category: string }) {
  const config = getCategoryConfig(category);
  return <OutlinedBadge color={config.color}>{config.label}</OutlinedBadge>;
}
