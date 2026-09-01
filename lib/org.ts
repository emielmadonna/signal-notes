// =============================================================================
// lib/org.ts — "which organization is this user acting in?", in ONE place.
//
// This query used to be copy-pasted verbatim into four call sites (the upload
// route, the fetch-url route, the generation engine, and the add-document
// sheet), each spelling it `.select("org_id").eq("user_id", …).limit(1)` with
// no ORDER BY. That is not just duplication — `limit(1)` without an order is
// an ARBITRARY row: a user who belongs to two organizations would have had
// their document land in whichever one Postgres happened to return first,
// and it could differ between two requests in the same session.
//
// One helper, one deterministic order (oldest membership first, org_id as the
// tie-break so the result is total), one place to change when this product
// grows a real org switcher.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { internalError } from "@/lib/errors";

/**
 * The user's active organization. Deterministic: the membership they have
 * held longest, with org_id breaking any same-timestamp tie so the ordering
 * is total and stable across calls.
 *
 * Returns a discriminated result rather than throwing, so every caller has to
 * spell out what it does when the lookup fails (constitution R3).
 */
export type OrgLookup =
  | { orgId: string; error: null }
  | { orgId: null; error: { status: number; message: string } };

export async function resolveOrgId(
  supabase: SupabaseClient,
  userId: string,
  options?: { signal?: AbortSignal }
): Promise<OrgLookup> {
  let query = supabase
    .from("org_members")
    .select("org_id") // named columns (R2)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("org_id", { ascending: true })
    .limit(1);
  if (options?.signal) query = query.abortSignal(options.signal);

  const { data, error } = await query;

  if (error) {
    return {
      orgId: null,
      error: {
        status: 500,
        message: internalError(
          "We couldn't look up your organization.",
          "resolveOrgId: org_members lookup failed",
          error
        ),
      },
    };
  }
  if (!data || data.length === 0) {
    return {
      orgId: null,
      error: {
        status: 403,
        message:
          "Your account isn't in an organization yet, so there is nowhere to put this.",
      },
    };
  }
  return { orgId: data[0].org_id as string, error: null };
}
