// Unit tests for lib/org.ts — the single org lookup that replaced four
// copy-pasted, UNORDERED `limit(1)` queries. The ordering is the whole point:
// without it, a user in two organizations had their documents land in an
// arbitrary one, and the choice could differ between requests.
//
// (This file also proves the "@/…" path alias resolves under the test runner,
// since lib/org.ts imports @/lib/errors.)
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrgId } from "@/lib/org";

type Call = { column: string; ascending: boolean };

/** Records the order() calls the helper makes, then returns a canned result. */
function stubClient(result: { data: unknown; error: unknown }, calls: Call[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.limit = chain;
  builder.abortSignal = chain;
  builder.order = (column: string, opts: { ascending: boolean }) => {
    calls.push({ column, ascending: opts.ascending });
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { from: () => builder } as unknown as SupabaseClient;
}

test("returns the org id and orders deterministically", async () => {
  const calls: Call[] = [];
  const result = await resolveOrgId(
    stubClient({ data: [{ org_id: "org-a" }], error: null }, calls),
    "user-1"
  );
  assert.equal(result.orgId, "org-a");
  assert.equal(result.error, null);
  // Oldest membership first, org_id as a total tie-break.
  assert.deepEqual(calls, [
    { column: "created_at", ascending: true },
    { column: "org_id", ascending: true },
  ]);
});

test("a user with no membership is a 403, not a crash or a silent null", async () => {
  const result = await resolveOrgId(stubClient({ data: [], error: null }, []), "user-1");
  assert.equal(result.orgId, null);
  assert.equal(result.error?.status, 403);
  assert.match(result.error!.message, /isn't in an organization/);
});

test("a lookup failure is a 500 that does NOT echo the driver text", async () => {
  const result = await resolveOrgId(
    stubClient({ data: null, error: { message: 'relation "org_members" does not exist' } }, []),
    "user-1"
  );
  assert.equal(result.error?.status, 500);
  const message = result.error!.message;
  assert.doesNotMatch(message, /relation|org_members|does not exist/);
  assert.match(message, /reference [0-9a-f]{6}/, "the operator's log id must be quotable");
});
