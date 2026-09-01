import { test, expect, type Page } from "@playwright/test";
import { signIn, evidence, firstOwnDocumentId, USERS } from "./helpers";

/**
 * P5 card-013 — RESPONSIVE FLOOR at 768px.
 *
 * Every surface is resized to the tablet floor (768px wide) and asserted to
 * have NO horizontal overflow: the document is never wider than its viewport
 * (a small tolerance absorbs sub-pixel rounding). The shell must hold — no
 * sideways scrollbar, no content sheared off the right edge. Every surface is
 * photographed into shiplog/evidence/p5-768/.
 */

const COMPLETE_BRIEFING = "345eef7d-ace6-486e-ba49-2d38a4a7f37a";
const TOLERANCE = 2; // px, for sub-pixel layout rounding

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // eslint-disable-next-line no-console
  console.log(
    `768-OVERFLOW ${label}: scrollWidth=${scrollWidth} clientWidth=${clientWidth} (tol ${TOLERANCE})`
  );
  expect(
    scrollWidth,
    `${label}: horizontal overflow (scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`
  ).toBeLessThanOrEqual(clientWidth + TOLERANCE);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
});

test("sign-in at 768px holds", async ({ page }) => {
  await page.goto("/signin");
  await expect(
    page.getByText("Briefings grounded in your own documents.")
  ).toBeVisible();
  await assertNoHorizontalOverflow(page, "signin");
  await evidence(page, "p5-768", "signin");
});

test("workspace at 768px holds", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await expect(page.getByText(USERS.northwind.org).first()).toBeVisible({
    timeout: 15_000,
  });
  // Wait for the documents section to settle out of loading.
  await expect(page.getByText(/\d+ FILES?/)).toBeVisible({ timeout: 15_000 });
  await assertNoHorizontalOverflow(page, "workspace");
  await evidence(page, "p5-768", "workspace");
});

test("add-document at 768px holds", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.goto("/documents/new");
  await expect(page.getByRole("button", { name: /save document/i })).toBeVisible({
    timeout: 15_000,
  });
  await assertNoHorizontalOverflow(page, "add-document");
  await evidence(page, "p5-768", "add-document");
});

test("document sheet at 768px holds", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  const docId = await firstOwnDocumentId(page);
  await page.goto(`/documents/${docId}`);
  // The sheet has rendered its body (not the not-found / loading state).
  await expect(page.getByText("This page doesn't exist.")).toHaveCount(0);
  await page.waitForTimeout(800);
  await assertNoHorizontalOverflow(page, "document-sheet");
  await evidence(page, "p5-768", "document-sheet");
});

test("composer at 768px holds", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.goto("/compose");
  await expect(
    page.getByText(/a briefing with no sources would just be a guess/i)
  ).toBeVisible({ timeout: 15_000 });
  await assertNoHorizontalOverflow(page, "composer");
  await evidence(page, "p5-768", "composer");
});

test("generation surface at 768px holds (complete briefing /generating)", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  await page.goto(`/briefings/${COMPLETE_BRIEFING}/generating`);
  await expect(page.getByText(/COMPLETE/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await assertNoHorizontalOverflow(page, "generation");
  await evidence(page, "p5-768", "generation");
});

test("reading view at 768px holds", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.goto(`/briefings/${COMPLETE_BRIEFING}`);
  await expect(
    page.getByRole("heading", { name: /Three Conversations, One Pattern/i })
  ).toBeVisible({ timeout: 20_000 });
  await assertNoHorizontalOverflow(page, "reading-view");
  await evidence(page, "p5-768", "reading-view");
});
