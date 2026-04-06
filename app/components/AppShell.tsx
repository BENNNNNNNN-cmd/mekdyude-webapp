"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import IdleLogout from "./IdleLogout";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="h-full flex">
      <IdleLogout />
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
