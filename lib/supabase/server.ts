// Server-side Supabase client (@supabase/ssr pattern).
// Uses ONLY the public URL + anon key; the service-role key must never
// appear here or in any client-reachable code (constitution: hard boundaries).
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll was called from a Server Component, where Next.js forbids
            // writing cookies. Safe to ignore: middleware.ts refreshes the
            // session cookies on every matched request.
          }
        },
      },
    }
  );
}
