import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { signIn, evidence, loadEnv, uploadAddedOrSkip, USERS } from "./helpers";
import path from "node:path";

/**
 * P3 live sweep (cards 007-009): documents CRUD end to end against the real
 * app and real database, as a real user. Serial: later tests reuse earlier
 * state within this file.
 */

test.describe.configure({ mode: "serial" });

const PASTE_TITLE = `E2E paste ${Date.now()}`;
const RENAMED_TITLE = `${PASTE_TITLE} (renamed)`;

test("workspace renders real seeded documents and briefings state", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  // briefings: either the honest empty state or real cards — never error
  await expect(page.getByText("We couldn't load your briefings.")).toHaveCount(0);
  // seeded docs: a known seeded tile renders
  const tiles = page.getByText("Interview notes — Priya Raghavan, VP Sales at Callisto Metrics (Aug 27, 2026)");
  await expect(tiles).toBeVisible({ timeout: 15_000 });
  await evidence(page, "p3-live", "workspace-populated-dark");
});

test("add document: missing-title state, then paste path saves", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.getByText("Add document").click();
  // The sheet now mounts OVER the live workspace (no route change): the
  // dialog is up, the workspace lists are still behind it — so every
  // interaction below is scoped to the dialog, or it would also match the
  // live tiles showing through the scrim.
  const sheet = page.getByRole("dialog", { name: /add a document/i });
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  // missing-title guidance (canvas copy) on save with empty title
  await sheet.getByRole("button", { name: /save document/i }).click();
  await expect(sheet.getByText(/A title is how you'll find this later/)).toBeVisible();
  await evidence(page, "p3-live", "add-doc-missing-title");
  // fill and save
  await sheet.locator("input.sn-add-field").fill(PASTE_TITLE);
  await sheet.getByRole("button", { name: "Call transcript", exact: true }).click();
  await sheet.locator("textarea").first().fill(
    "E2E transcript body. Speaker one: this document was pasted by the automated live sweep.\n\nSpeaker two: and its whole lifecycle is verified — save, rename, history, delete."
  );
  await page.getByRole("button", { name: /save document/i }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
  await expect(page.locator("main").getByText(PASTE_TITLE).first()).toBeVisible({ timeout: 15_000 });
  await evidence(page, "p3-live", "add-doc-saved-in-list");
});

test("upload path: TXT file through the sheet's browse input", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.goto("/documents/new");
  const fixture = path.join(process.cwd(), "e2e", "fixtures", "e2e-upload.txt");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  // canvas: drop/browse → upload → toast "<file> added". A shared-DB rate
  // limiter refusal is a SKIP (path not exercised), never a red (helpers).
  await uploadAddedOrSkip(page, /e2e-upload\.txt.*added|added/, 20_000);
  await page.goto("/");
  await expect(page.locator("main").getByText("e2e-upload").first()).toBeVisible({ timeout: 15_000 });
});

test("document sheet: body, file history shows UPLOADED/created line", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  const tile = page.locator("main").getByText(PASTE_TITLE).first();
  await tile.hover();
  await page.getByRole("button", { name: `Open ${PASTE_TITLE}` }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+/);
  await expect(page.getByText("Speaker one: this document was pasted")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Not used in any briefing yet.")).toBeVisible();
  await evidence(page, "p3-live", "document-sheet");
});

test("rename via selection bar: working state, SAVED, optimistic tile", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.locator("main").getByText(PASTE_TITLE).first().click(); // select tile
  await expect(page.getByText("1 document selected")).toBeVisible();
  await evidence(page, "p3-live", "selection-bar");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page).toHaveURL(/\?edit=1/);
  const titleInput = page.locator("input").first();
  await titleInput.fill(RENAMED_TITLE);
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText("SAVED")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/TITLE EDITED|→/).first()).toBeVisible();
  await evidence(page, "p3-live", "rename-saved-history");
  await page.getByRole("button", { name: /close/i }).or(page.locator('button[aria-label*="lose"]')).first().click();
  await expect(page.locator("main").getByText(RENAMED_TITLE).first()).toBeVisible({ timeout: 15_000 });
});

test("delete via selection bar: confirm sheet, working state, tile gone", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.locator("main").getByText(RENAMED_TITLE).first().click();
  await expect(page.getByText("1 document selected")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/Delete this document\?/)).toBeVisible();
  await expect(page.locator("main").getByText(RENAMED_TITLE).nth(0)).toBeVisible();
  await evidence(page, "p3-live", "delete-confirm-sheet");
  await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();
  await expect(page.locator("main").getByText(RENAMED_TITLE)).toHaveCount(0, { timeout: 15_000 });
  // NOTE: this spec deliberately does NOT clean up p5-upload's "e2e-upload"
  // fixtures THROUGH THE UI. That belongs to the spec that creates them, and
  // doing it here by text was actively harmful:
  //
  //   page.locator("main").getByText("e2e-upload").first().click()
  //
  // getByText matches substrings, and the workspace renders an AUDIT TRAIL
  // whose lines survive the deletion of the documents they describe (decision
  // D07; migration 0002 does it with `on delete set null`). There are already
  // 89 such rows naming "e2e-upload", none removable through the app because
  // audit_events has no DELETE policy by design. So .first() selected an audit
  // line rather than a tile, no Delete button ever appeared, and the test hung
  // for its full 60 s timeout — then left a real document behind, which made
  // p5-upload fail too. One loose selector, two red tests, neither of them
  // about anything that was actually broken in the product.
});

/**
 * Leave the org as we found it — the DB way, not the UI way (see the note
 * above for why UI-side cleanup was harmful). This spec's upload test writes
 * a real e2e-upload.txt row and must not hand it down to p5-upload, whose
 * delete assertion counts the "Open e2e-upload…" tiles and expects its OWN
 * upload to be the only one (a green p3 upload otherwise guarantees a red
 * p5). Same pattern as p6-ingestion's afterAll.
 */
test.afterAll(async () => {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(
      "delete from public.documents where file_name = 'e2e-upload.txt' and title = 'e2e-upload'"
    );
  } finally {
    await client.end();
  }
});

test("search filters both sections with canvas subs", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.getByPlaceholder(/search briefings and documents/i).fill("Callisto");
  await expect(page.getByText(/OF \d+ FILES/)).toBeVisible({ timeout: 10_000 });
  await evidence(page, "p3-live", "search-filtered");
});

test("cross-org document id renders not-found (isolation's UX face)", async ({ page }) => {
  const anaDocId = process.env.E2E_CROSS_ORG_DOC_ID;
  test.skip(!anaDocId, "E2E_CROSS_ORG_DOC_ID not provided");
  await signIn(page, USERS.meridian.email);
  await page.goto(`/documents/${anaDocId}`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({ timeout: 15_000 });
  await evidence(page, "p3-live", "cross-org-not-found");
});
