import { test, expect } from "@playwright/test";
import { signIn, evidence, firstOwnDocumentId, USERS } from "./helpers";

/**
 * P5 card-013 — TENANT ISOLATION, the UX face (constitution rule 1).
 *
 * The DB layer is already probe-proven (shiplog/evidence/r1-probe-*). This is
 * the SAME guarantee, live in the browser: a user of org B (Marta / Meridian
 * Group) who deep-links straight to an org-A (Ana / Northwind Advisory) id
 * must see the not-found sheet — never the other org's content, never a raw
 * error dump. RLS returns zero rows; the UI reads zero rows as "doesn't exist".
 */

// A known org-A (Northwind / Ana) COMPLETE briefing (same id P4 reads).
const ORG_A_BRIEFING = "345eef7d-ace6-486e-ba49-2d38a4a7f37a";
// A distinctive fragment of org-A briefing content — must NEVER appear for Marta.
const ORG_A_BRIEFING_TITLE = /Three Conversations, One Pattern/i;

test.describe.configure({ mode: "serial" });

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
  await signIn(page, USERS.meridian.email);
  await page.goto(`/briefings/${ORG_A_BRIEFING}`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({
    timeout: 15_000,
  });
  // The org-A briefing's real heading must NOT render for a different org.
  await expect(page.getByRole("heading", { name: ORG_A_BRIEFING_TITLE })).toHaveCount(
    0
  );
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
  await signIn(page, USERS.meridian.email);
  await page.goto(`/briefings/${ORG_A_BRIEFING}/generating`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: ORG_A_BRIEFING_TITLE })).toHaveCount(
    0
  );
  await evidence(page, "p5-isolation", "cross-org-generating-not-found");
});
