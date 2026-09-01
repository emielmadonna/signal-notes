// Browser-side Supabase client (@supabase/ssr pattern).
// Uses ONLY the public URL + anon key; the service-role key must never
// appear here or in any client-reachable code (constitution: hard boundaries).
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
