import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Static export: this module only runs in the browser. We tolerate a missing
// env at build time (export prerender) and fail loudly at first client use.
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
