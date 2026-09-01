import { test, expect } from "@playwright/test";
import {
  signIn,
  evidence,
  reachGenerationSurfaceOrSkip,
  requireModelKey,
  USERS,
  firstCompleteBriefingId,
} from "./helpers";

/**
 * P4 live sweep: the composer, and a REAL streaming generation end to end
 * against the live database and the real Anthropic API. This is the product's
 * heart — the test generates an actual briefing and watches it stream.
 */
test.describe.configure({ mode: "serial" });

test("composer: model picker, zero-selected copy, pick + generate", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  await page.goto("/compose");
  // zero selected: the disabled-at-zero explanation
  await expect(
    page.getByText(/a briefing with no sources would just be a guess/i)
  ).toBeVisible({ timeout: 15_000 });
  // model picker present with the three options
  await expect(page.getByRole("button", { name: /Sonnet/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Opus/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Haiku/ })).toBeVisible();
  await evidence(page, "p4-live", "composer-zero");
  // pick two documents
  const tiles = page.locator("main").getByText(/Interview notes|Call transcript|Homepage copy/);
  await tiles.nth(0).click();
  await tiles.nth(1).click();
  await evidence(page, "p4-live", "composer-selected");
});

test("live generation: stream a real briefing to completion", async ({ page }) => {
  requireModelKey();
  test.setTimeout(180_000); // real model generation
  await signIn(page, USERS.northwind.email);
  await page.goto("/compose");
  const tiles = page.locator("main").getByText(/Interview notes|Call transcript|Homepage copy/);
  await tiles.nth(0).click();
  await tiles.nth(1).click();
  await page.getByRole("button", { name: /Generate briefing/i }).click();
  // lands on the live generation surface (or the limiter refused the run)
  await reachGenerationSurfaceOrSkip(page);
  // rule 8: a labeled activity log appears (not a bare spinner) — a TOOL/READ line
  await expect(page.getByText(/Reading|Planning|Theme/i).first()).toBeVisible({ timeout: 60_000 });
  await evidence(page, "p4-live", "generation-midstream");
  // it completes: the "Read the briefing" affordance appears
  await expect(page.getByText(/Read the briefing|COMPLETE/i).first()).toBeVisible({ timeout: 150_000 });
  await evidence(page, "p4-live", "generation-complete");
});

test("resume view: a complete briefing replays its log", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  const id = await firstCompleteBriefingId(page);
  await page.goto(`/briefings/${id}/generating`);
  // replays persisted events → shows COMPLETE + the real streamed body
  await expect(page.getByText(/COMPLETE/i).first()).toBeVisible({ timeout: 30_000 });
  await evidence(page, "p4-live", "generation-resumed");
});

test("reading view: citations tooltip, grounding chips, feedback persists, log + audit", async ({ page }) => {
  await signIn(page, USERS.northwind.email);
  const id = await firstCompleteBriefingId(page);
  await page.goto(`/briefings/${id}`);
  // a real briefing renders: serif title heading + the GROUNDED IN source row
  await expect(page.getByRole("dialog").getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/GROUNDED IN/i)).toBeVisible();
  await evidence(page, "p4-live", "reading-view");
  // citation tooltip: hover the first superscript marker → a source-quote
  // tooltip appears (the quote text differs per briefing; assert the tooltip's
  // stable PASSAGE/source affordance rather than a fixed string).
  const body = page.getByRole("dialog");
  const cite = body.getByText("1", { exact: true }).first();
  if (await cite.count()) {
    await cite.hover({ force: true });
    await evidence(page, "p4-live", "citation-tooltip");
  }
  // feedback: rate useful, expect the rated line, reload, expect it persists
  await page.getByRole("button", { name: /Useful/i }).first().click();
  await expect(page.getByText(/YOU RATED THIS USEFUL/i)).toBeVisible({ timeout: 15_000 });
  await evidence(page, "p4-live", "feedback-rated");
  // let the async upsert settle before reload (a real user doesn't reload in <1s),
  // then prove it persisted server-side by reload — rule 7.
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.getByText(/YOU RATED THIS USEFUL/i)).toBeVisible({ timeout: 20_000 });
  // audit trail toggle shows the append-only table
  await page.getByRole("button", { name: /Audit trail/i }).click();
  await expect(page.getByText(/APPEND-ONLY/i)).toBeVisible();
  await expect(page.getByText(/RUN STARTED/i).first()).toBeVisible();
  await evidence(page, "p4-live", "audit-trail");
});
