"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogIn, WifiOff } from "lucide-react";
import { getCachedSession, onAuthChange, signInWithGoogle } from "@/lib/supabase/auth";

type GateState =
  | { kind: "loading" }
  | { kind: "authed"; session: Session }
  | { kind: "needs-login"; online: boolean };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await getCachedSession();
      if (!mounted) return;
      if (session) setState({ kind: "authed", session });
      else setState({ kind: "needs-login", online: navigator.onLine });
    })();
    const unsub = onAuthChange((session) => {
      if (!mounted) return;
      if (session) setState({ kind: "authed", session });
      else setState({ kind: "needs-login", online: navigator.onLine });
    });
    const onOnline = () =>
      setState((s) =>
        s.kind === "needs-login" ? { ...s, online: true } : s,
      );
    const onOffline = () =>
      setState((s) =>
        s.kind === "needs-login" ? { ...s, online: false } : s,
      );
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      mounted = false;
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (state.kind === "loading") return null;
  if (state.kind === "authed") return <>{children}</>;

  // needs-login
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 px-8 text-center">
      <h1 className="font-[family-name:var(--font-jakarta)] text-2xl font-bold">
        Cadence
      </h1>
      {state.online ? (
        <>
          <p className="max-w-xs text-sm text-muted">
            Inicia sesión con Google para sincronizar tus tareas entre
            dispositivos.
          </p>
          <button
            onClick={() => signInWithGoogle()}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background"
          >
            <LogIn className="size-4" aria-hidden />
            Continuar con Google
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted">
          <WifiOff className="size-8" aria-hidden />
          <p className="max-w-xs text-sm">
            Necesitas conexión para iniciar sesión la primera vez. Conéctate y
            vuelve a intentarlo.
          </p>
        </div>
      )}
    </div>
  );
}
