import type { Metadata } from "next";
import "./globals.css";
import AppShell from "./components/AppShell";
import ThemeProvider from "./components/ThemeProvider";

export const metadata: Metadata = {
  title: "Mek Dyude — Gestionnaire de domaines",
  description: "Dashboard de gestion des domaines pour le Duché de Bicolline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full">
      <body className="h-full">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
