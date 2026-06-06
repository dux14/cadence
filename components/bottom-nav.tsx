"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, History, LayoutGrid, Settings, Sparkles } from "lucide-react";
import { Logo } from "./logo";
import { SyncStatus } from "./sync-status";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Today", icon: CalendarCheck, mobileVisible: true },
  { href: "/projects", label: "Projects", icon: LayoutGrid, mobileVisible: true },
  { href: "/historico", label: "Histórico", icon: Sparkles, mobileVisible: true },
  { href: "/history", label: "History", icon: History, mobileVisible: false },
  { href: "/settings", label: "Ajustes", icon: Settings, mobileVisible: true },
];

/** Bottom tab bar on mobile; side rail from md up. <main> scrolls, not us. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="safe-bottom z-30 shrink-0 border-t border-border bg-surface/90 backdrop-blur md:flex md:h-full md:w-14 md:flex-col md:border-t-0 md:border-r md:bg-transparent md:px-2 md:py-6 md:backdrop-blur-none lg:w-[220px] lg:px-3">
      <div className="mb-7 hidden items-center gap-2.5 px-1 md:flex lg:px-2">
        <Logo size={28} />
        <span className="hidden font-display text-[17px] font-bold lg:inline">Cadence</span>
      </div>
      <div className="mx-auto flex max-w-md md:mx-0 md:max-w-none md:flex-col md:gap-1">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-label={t.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition md:flex-none md:flex-row md:justify-center md:gap-3 md:rounded-xl md:px-0 md:py-2.5 md:text-[14px] lg:justify-start lg:px-3",
                active ? "text-foreground md:bg-border/50" : "text-muted md:hover:bg-border/30",
                !t.mobileVisible && "hidden md:flex",
              )}
            >
              <Icon size={20} className={active ? "text-foreground" : ""} />
              <span className={cn("md:hidden lg:inline")}>{t.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-auto hidden items-center gap-3 px-1 md:flex md:justify-center lg:justify-start lg:px-2">
        <ThemeToggle />
        <SyncStatus />
      </div>
    </nav>
  );
}
