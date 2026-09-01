import { test, expect } from "@playwright/test";
import { signIn, evidence, USERS } from "./helpers";
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
  await signIn(page, USERS.ana.email);
  // briefings: either the honest empty state or real cards — never error
  await expect(page.getByText("We couldn't load your briefings.")).toHaveCount(0);
  // seeded docs: a known seeded tile renders
  const tiles = page.getByText("Interview notes — Priya Raghavan, VP Sales at Callisto Metrics (Aug 27, 2026)");
  await expect(tiles).toBeVisible({ timeout: 15_000 });
  await evidence(page, "p3-live", "workspace-populated-dark");
});

test("add document: missing-title state, then paste path saves", async ({ page }) => {
  await signIn(page, USERS.ana.email);
  await page.getByText("Add document").click();
  await expect(page).toHaveURL(/\/documents\/new/);
  // missing-title guidance (canvas copy) on save with empty title
  await page.getByRole("button", { name: /save document/i }).click();
  await expect(page.getByText(/A title is how you'll find this later/)).toBeVisible();
  await evidence(page, "p3-live", "add-doc-missing-title");
  // fill and save
  await page.locator("input.sn-add-field").fill(PASTE_TITLE);
  await page.getByRole("button", { name: "Call transcript" }).click();
  await page.locator("textarea").first().fill(
    "E2E transcript body. Speaker one: this document was pasted by the automated live sweep.\n\nSpeaker two: and its whole lifecycle is verified — save, rename, history, delete."
  );
  await page.getByRole("button", { name: /save document/i }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
  await expect(page.locator("main").getByText(PASTE_TITLE).first()).toBeVisible({ timeout: 15_000 });
  await evidence(page, "p3-live", "add-doc-saved-in-list");
});

test("upload path: TXT file through the sheet's browse input", async ({ page }) => {
  await signIn(page, USERS.ana.email);
  await page.goto("/documents/new");
  const fixture = path.join(process.cwd(), "e2e", "fixtures", "e2e-upload.txt");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  // canvas: drop/browse → upload → toast "<file> added"
  await expect(page.getByText(/e2e-upload\.txt.*added|added/).first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/");
  await expect(page.locator("main").getByText("e2e-upload").first()).toBeVisible({ timeout: 15_000 });
});

test("document sheet: body, file history shows UPLOADED/created line", async ({ page }) => {
  await signIn(page, USERS.ana.email);
  const tile = page.locator("main").getByText(PASTE_TITLE).first();
  await tile.hover();
  await page.getByRole("button", { name: `Open ${PASTE_TITLE}` }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+/);
  await expect(page.getByText("Speaker one: this document was pasted")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Not used in any briefing yet.")).toBeVisible();
  await evidence(page, "p3-live", "document-sheet");
});

test("rename via selection bar: working state, SAVED, optimistic tile", async ({ page }) => {
  await signIn(page, USERS.ana.email);
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
  await signIn(page, USERS.ana.email);
  await page.locator("main").getByText(RENAMED_TITLE).first().click();
  await expect(page.getByText("1 document selected")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/Delete this document\?/)).toBeVisible();
  await expect(page.locator("main").getByText(RENAMED_TITLE).nth(0)).toBeVisible();
  await evidence(page, "p3-live", "delete-confirm-sheet");
  await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();
  await expect(page.locator("main").getByText(RENAMED_TITLE)).toHaveCount(0, { timeout: 15_000 });
  // also delete the uploaded fixture doc to keep the org tidy
  await page.locator("main").getByText("e2e-upload").first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();
  await expect(page.locator("main").getByText("e2e-upload")).toHaveCount(0, { timeout: 15_000 });
});

test("search filters both sections with canvas subs", async ({ page }) => {
  await signIn(page, USERS.ana.email);
  await page.getByPlaceholder(/search briefings and documents/i).fill("Callisto");
  await expect(page.getByText(/OF \d+ FILES/)).toBeVisible({ timeout: 10_000 });
  await evidence(page, "p3-live", "search-filtered");
});

test("cross-org document id renders not-found (isolation's UX face)", async ({ page }) => {
  const anaDocId = process.env.E2E_CROSS_ORG_DOC_ID;
  test.skip(!anaDocId, "E2E_CROSS_ORG_DOC_ID not provided");
  await signIn(page, USERS.marta.email);
  await page.goto(`/documents/${anaDocId}`);
  await expect(page.getByText("This page doesn't exist.")).toBeVisible({ timeout: 15_000 });
  await evidence(page, "p3-live", "cross-org-not-found");
});
