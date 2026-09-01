// =============================================================================
// lib/rate-limit.ts — per-user request ceilings for the expensive endpoints.
//
// Backed by private.consume_rate_limit() (migration 0003), i.e. by Postgres
// rather than process memory: this app is serverless, so an in-memory counter
// would reset on every cold start and be defeated by concurrency across
// instances. The ceilings live in the SQL function, not here and not in the
// request — the caller only names a bucket.
//
// KNOWN WEAKNESS, stated here rather than discovered later: these are FIXED
// windows, not sliding ones. A caller who spends the ceiling at the end of one
// window and again at the start of the next gets up to 2x the nominal rate in
// a short burst. (Seen directly while testing: a probe that began 295 s into a
// 300 s window reported retry_after=5s, so a second full allowance was five
// seconds away.) That is the standard trade for a counter costing one
// round-trip and no background state, and the ceilings are set with the burst
// in mind. A sliding window means storing per-request timestamps — a different
// design, not a tweak.
//
// FAILURE MODE, stated rather than implied: if the limiter ITSELF errors (the
// migration is not applied yet, the RPC is unreachable), this fails OPEN and
// logs loudly. That is a deliberate trade: this control guards spend and
// outbound-fetch abuse, not access — authentication is enforced separately and
// independently on every one of these routes — and a limiter fault should not
// take the product down. The loud log is what makes the choice auditable.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** The buckets private.consume_rate_limit() knows. Anything else is denied. */
export type RateLimitBucket = "fetch-url" | "upload" | "generate";

export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the current window rolls over (0 when allowed). */
  retryAfterSeconds: number;
};

type ConsumeRow = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

/** Human sentence for a 429 body, so the route never ships a bare status. */
export function rateLimitMessage(
  bucket: RateLimitBucket,
  retryAfterSeconds: number
): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const wait = `Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  switch (bucket) {
    case "fetch-url":
      return `You've fetched a lot of pages in a short time, so this one was held back. ${wait}`;
    case "upload":
      return `You've uploaded a lot of files in a short time, so this one was held back. ${wait}`;
    case "generate":
      return `You've reached the hourly limit on briefing generations. ${wait}`;
  }
}

/**
 * Count this request against the user's ceiling for `bucket`.
 * The user is identified by the RPC from the verified session, not by any
 * argument — there is no user id to spoof here.
 */
export async function consumeRateLimit(
  supabase: SupabaseClient,
  bucket: RateLimitBucket
): Promise<RateLimitVerdict> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket: bucket,
  });

  if (error) {
    console.error(
      `rate limiter unavailable for bucket "${bucket}" — ALLOWING this request; ` +
        `if migration 0003 is unapplied, apply it: ${error.message}`
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const row = (Array.isArray(data) ? data[0] : data) as ConsumeRow | undefined;
  if (!row || typeof row.allowed !== "boolean") {
    console.error(
      `rate limiter returned an unreadable row for bucket "${bucket}" — ALLOWING this request.`
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: row.allowed ? 0 : Math.max(1, row.retry_after_seconds),
  };
}
