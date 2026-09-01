import { test, expect } from "@playwright/test";
import {
  signIn,
  evidence,
  firstOwnDocumentId,
  firstCompleteBriefingId,
  USERS,
} from "./helpers";

/**
 * P5 card-013 — TENANT ISOLATION, the UX face (constitution rule 1).
 *
 * The DB layer is already probe-proven (shiplog/evidence/r1-probe-*). This is
 * the SAME guarantee, live in the browser: a user of org B (Marta / Meridian
 * Group) who deep-links straight to an org-A (Ana / Northwind Advisory) id
 * must see the not-found sheet — never the other org's content, never a raw
 * error dump. RLS returns zero rows; the UI reads zero rows as "doesn't exist".
 */

test.describe.configure({ mode: "serial" });

// Capture a REAL org-A (Northwind) complete briefing id the honest way, as
// that org's admin, then hand it to the cross-org tests. Resolved per test so
// no vanished hard-coded id can make an isolation test pass vacuously.
async function orgABriefingId(page: import("@playwright/test").Page): Promise<string> {
  await signIn(page, USERS.northwind.email);
  const id = await firstCompleteBriefingId(page);
  await page.context().clearCookies();
  return id;
}

test("Marta (org B) deep-linking an org-A document id → not-found, never org-A content", async ({
  page,
}) => {
  // First, capture a REAL org-A document id the honest way, as Ana.
  await signIn(page, USERS.northwind.email);
  const orgADocId = await firstOwnDocumentId(page);

  // Become Marta: drop Ana's session entirely, then sign in fresh.
  await page.context().clearCookies();
  await signIn(page, USERS.meridian.email);
  await expect(page.getByText(USERS.meridian.org).first()).toBeVisible({
    timeout: 15_000,
  });

  // Deep-link straight to Ana's document id.
  await page.goto(`/documents/${orgADocId}`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({
    timeout: 15_000,
  });
  // Never org-A content, never an error dump.
  await expect(page.getByText("We couldn't load")).toHaveCount(0);
  await expect(page.getByText(/row-level security|RLS|stack|Error:/i)).toHaveCount(
    0
  );
  await evidence(page, "p5-isolation", "cross-org-document-not-found");
});

test("Marta (org B) deep-linking an org-A briefing id → not-found, never org-A content", async ({
  page,
}) => {
  const orgABriefing = await orgABriefingId(page);
  await signIn(page, USERS.meridian.email);
  await page.goto(`/briefings/${orgABriefing}`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({
    timeout: 15_000,
  });
  // No org-A briefing content renders for a different org (no reading sheet).
  await expect(page.getByRole("dialog").getByText(/GROUNDED IN/i)).toHaveCount(0);
  await expect(page.getByText("We couldn't load")).toHaveCount(0);
  await expect(page.getByText(/row-level security|RLS|stack|Error:/i)).toHaveCount(
    0
  );
  await evidence(page, "p5-isolation", "cross-org-briefing-not-found");
});

test("Marta (org B) deep-linking an org-A briefing /generating id → not-found", async ({
  page,
}) => {
  // The live generation surface is org-scoped the same way: a cross-org id
  // resumes nothing and renders not-found, never org-A's streamed log.
  const orgABriefing = await orgABriefingId(page);
  await signIn(page, USERS.meridian.email);
  await page.goto(`/briefings/${orgABriefing}/generating`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({
    timeout: 20_000,
  });
  // No org-A generation log/body renders for a different org.
  await expect(page.getByText(/GROUNDED IN|STEPS ·/i)).toHaveCount(0);
  await evidence(page, "p5-isolation", "cross-org-generating-not-found");
});
