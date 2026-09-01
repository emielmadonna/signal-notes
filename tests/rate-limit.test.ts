// Unit tests for lib/rate-limit.ts — in particular the documented FAIL-OPEN
// behaviour, which is a deliberate trade and therefore must be pinned: if it
// ever silently flips to fail-closed, an unapplied migration would take the
// whole product down instead of merely un-metering it.
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeRateLimit, rateLimitMessage } from "@/lib/rate-limit";

/** Minimal stand-in: only .rpc() is ever touched by the module under test. */
function stubClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return { rpc: async () => result } as unknown as SupabaseClient;
}

test("allows a request the RPC says is inside the ceiling", async () => {
  const verdict = await consumeRateLimit(
    stubClient({ data: [{ allowed: true, remaining: 19, retry_after_seconds: 240 }], error: null }),
    "fetch-url"
  );
  assert.deepEqual(verdict, { allowed: true, retryAfterSeconds: 0 });
});

test("denies, and reports a retry delay, when the ceiling is hit", async () => {
  const verdict = await consumeRateLimit(
    stubClient({ data: [{ allowed: false, remaining: 0, retry_after_seconds: 90 }], error: null }),
    "generate"
  );
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.retryAfterSeconds, 90);
});

test("a zero retry delay is reported as at least one second", async () => {
  const verdict = await consumeRateLimit(
    stubClient({ data: [{ allowed: false, remaining: 0, retry_after_seconds: 0 }], error: null }),
    "upload"
  );
  assert.equal(verdict.retryAfterSeconds, 1);
});

test("FAILS OPEN when the limiter itself errors (documented trade)", async () => {
  const verdict = await consumeRateLimit(
    stubClient({ data: null, error: { message: "function consume_rate_limit does not exist" } }),
    "generate"
  );
  assert.equal(verdict.allowed, true, "a limiter fault must not take the product down");
});

test("FAILS OPEN on an unreadable row rather than guessing", async () => {
  const verdict = await consumeRateLimit(stubClient({ data: [], error: null }), "upload");
  assert.equal(verdict.allowed, true);
});

test("every bucket produces a human sentence naming a wait", () => {
  for (const bucket of ["fetch-url", "upload", "generate"] as const) {
    const message = rateLimitMessage(bucket, 300);
    assert.match(message, /Try again in about 5 minutes\./);
    assert.ok(message.length > 40, "the 429 body must explain itself, not just 429");
  }
  assert.match(rateLimitMessage("upload", 30), /about 1 minute\./);
});
