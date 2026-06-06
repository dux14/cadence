"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

// useSyncExternalStore over the <html> class: hydration-safe (server snapshot
// is always light) and lint-clean — no setState-in-effect double render.
let listeners: Array<() => void> = [];

function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot(): boolean {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("cadence-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    for (const l of listeners) l();
  }, []);

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light or dark theme"
      className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-border/50 hover:text-foreground"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
