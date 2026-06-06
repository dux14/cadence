import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Static export: NEXT_PUBLIC_* is inlined at build time, so the top-level
// reads tolerate undefined during build/prerender; getSupabase() throws if
// called before the env vars are available (i.e. first client use).
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true, // localStorage — survives offline cold start
      autoRefreshToken: true,
      detectSessionInUrl: true, // OAuth redirect lands back here
    },
  });
  return cached;
}
