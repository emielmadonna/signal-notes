import { test, expect, type Route } from "@playwright/test";
import { signIn, evidence, USERS } from "./helpers";

/**
 * P5 card-013 — HONEST FAILURE (constitution rule 9).
 *
 * A non-2xx (or a dropped connection) must NEVER render as empty success. We
 * force the real client fetches to fail by intercepting the Supabase REST call
 * the workspace makes, and assert the ERROR state renders — distinct from the
 * EMPTY state and from LOADING. No app change is needed: the failure is
 * injected at the network layer, exactly where a real 500 or a real dropped
 * connection would live.
 *
 * REST endpoints the workspace hits (lib/workspace-data.ts):
 *   GET …/rest/v1/documents?…   → the Documents section
 *   GET …/rest/v1/briefings?…   → the Briefings section
 * These are independent requests, so one failing must not poison the other.
 */

const NONEXISTENT_UUID = "11111111-2222-3333-4444-555555555555";

const fulfill500 = (route: Route) =>
  route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({
      message: "forced 500 (P5 rule-9 test)",
      code: "500",
    }),
  });

test("forced 500 on documents → error state, not fake-empty; briefings stay healthy", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  // Fail ONLY the documents request; leave briefings untouched.
  await page.route("**/rest/v1/documents**", fulfill500);
  await page.reload();

  // Documents section: the error copy (rule-9 error state), a retry, and the
  // UNAVAILABLE sub-line — never the empty "Drop your first document here".
  await expect(page.getByText("We couldn't load your documents.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  await expect(page.getByText("UNAVAILABLE")).toBeVisible();
  // error ≠ empty: the empty-state target must NOT be on screen.
  await expect(page.getByText("Drop your first document here")).toHaveCount(0);
  // error ≠ empty for its sub-line either.
  await expect(page.getByText("NONE")).toHaveCount(0);

  // Independence: briefings did NOT inherit the documents failure. Seeded org
  // → briefings render (populated), never their own error.
  await expect(page.getByText("We couldn't load your briefings.")).toHaveCount(
    0
  );
  await evidence(page, "p5-failures", "documents-500-error");
});

test("forced 500 on briefings → error state; documents stay healthy", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  await page.route("**/rest/v1/briefings**", fulfill500);
  await page.reload();

  await expect(page.getByText("We couldn't load your briefings.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  // The documents section is fine: its seeded tiles are still here, no error.
  await expect(page.getByText("We couldn't load your documents.")).toHaveCount(
    0
  );
  await evidence(page, "p5-failures", "briefings-500-error");
});

test("retry recovers: unroute, click Try again → the section repopulates", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  await page.route("**/rest/v1/documents**", fulfill500);
  await page.reload();
  await expect(page.getByText("We couldn't load your documents.")).toBeVisible({
    timeout: 15_000,
  });
  // Heal the network, then use the retry the error state offers.
  await page.unroute("**/rest/v1/documents**");
  await page.getByRole("button", { name: /try again/i }).click();
  // Real seeded documents come back — proof the error state was recoverable,
  // not a dead end.
  await expect(page.getByText("We couldn't load your documents.")).toHaveCount(
    0,
    { timeout: 15_000 }
  );
  await expect(page.getByText(/\d+ FILES?/)).toBeVisible({ timeout: 15_000 });
});

test("aborted documents fetch → error state, never a stale/empty render", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  // A dropped connection (route.abort) is the transport-failure half of rule 9.
  await page.route("**/rest/v1/documents**", (route) => route.abort());
  await page.reload();
  // The failed transport surfaces as ERROR, not as "no data yet" (empty).
  await expect(page.getByText("We couldn't load your documents.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Drop your first document here")).toHaveCount(0);
});

test("nonexistent document id → not-found sheet (not error, not blank)", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  await page.goto(`/documents/${NONEXISTENT_UUID}`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("It may have been deleted, or the link may be wrong.")).toBeVisible();
  await evidence(page, "p5-failures", "document-not-found");
});

test("nonexistent briefing id → not-found sheet (not error, not blank)", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  await page.goto(`/briefings/${NONEXISTENT_UUID}`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({
    timeout: 15_000,
  });
  await evidence(page, "p5-failures", "briefing-not-found");
});
