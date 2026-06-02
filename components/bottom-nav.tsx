"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, LayoutGrid, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Today", icon: CalendarCheck },
  { href: "/projects", label: "Projects", icon: LayoutGrid },
  { href: "/historico", label: "Histórico", icon: Sparkles },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 border-t border-border bg-surface/90 backdrop-blur safe-bottom">
      <div className="mx-auto flex max-w-md">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition",
                active ? "text-foreground" : "text-muted",
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
