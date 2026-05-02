"use client";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useTheme() {
  return { theme: "light" as const, toggle: () => {} };
}
