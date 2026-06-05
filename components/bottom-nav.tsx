"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, LayoutGrid, Settings, Sparkles } from "lucide-react";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Today", icon: CalendarCheck },
  { href: "/projects", label: "Projects", icon: LayoutGrid },
  { href: "/historico", label: "Histórico", icon: Sparkles },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

/** Bottom tab bar on mobile; side rail from md up. <main> scrolls, not us. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="safe-bottom z-30 shrink-0 border-t border-border bg-surface/90 backdrop-blur md:h-full md:w-48 md:border-t-0 md:border-r md:bg-transparent md:px-3 md:py-6 md:backdrop-blur-none">
      <div className="mb-7 hidden items-center gap-2.5 px-3 md:flex">
        <Logo size={28} />
        <span className="font-display text-[17px] font-bold">Cadence</span>
      </div>
      <div className="mx-auto flex max-w-md md:mx-0 md:max-w-none md:flex-col md:gap-1">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition md:flex-none md:flex-row md:gap-3 md:rounded-xl md:px-3 md:text-[14px]",
                active ? "text-foreground md:bg-border/50" : "text-muted md:hover:bg-border/30",
              )}
            >
              <Icon size={20} className={active ? "text-foreground" : ""} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
