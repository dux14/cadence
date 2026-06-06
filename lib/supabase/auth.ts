import { getSupabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

export async function signInWithGoogle(): Promise<void> {
  const sb = getSupabase();
  await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

/**
 * Reads the session from localStorage WITHOUT hitting the network — lets the
 * app cold-start offline when a session was previously cached.
 */
export async function getCachedSession(): Promise<Session | null> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const sb = getSupabase();
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
