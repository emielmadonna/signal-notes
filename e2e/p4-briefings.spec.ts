import { test, expect } from "@playwright/test";
import { signIn, evidence, USERS } from "./helpers";

/**
 * P4 live sweep: the composer, and a REAL streaming generation end to end
 * against the live database and the real Anthropic API. This is the product's
 * heart — the test generates an actual briefing and watches it stream.
 */
test.describe.configure({ mode: "serial" });

test("composer: model picker, zero-selected copy, pick + generate", async ({ page }) => {
  await signIn(page, USERS.ana.email);
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
  test.setTimeout(180_000); // real model generation
  await signIn(page, USERS.ana.email);
  await page.goto("/compose");
  const tiles = page.locator("main").getByText(/Interview notes|Call transcript|Homepage copy/);
  await tiles.nth(0).click();
  await tiles.nth(1).click();
  await page.getByRole("button", { name: /Generate briefing/i }).click();
  // lands on the live generation surface
  await expect(page).toHaveURL(/\/briefings\/[0-9a-f-]+\/generating/, { timeout: 20_000 });
  // rule 8: a labeled activity log appears (not a bare spinner) — a TOOL/READ line
  await expect(page.getByText(/Reading|Planning|Theme/i).first()).toBeVisible({ timeout: 60_000 });
  await evidence(page, "p4-live", "generation-midstream");
  // it completes: the "Read the briefing" affordance appears
  await expect(page.getByText(/Read the briefing|COMPLETE/i).first()).toBeVisible({ timeout: 150_000 });
  await evidence(page, "p4-live", "generation-complete");
});

test("resume view: the existing complete briefing replays its log", async ({ page }) => {
  const id = "345eef7d-ace6-486e-ba49-2d38a4a7f37a";
  await signIn(page, USERS.ana.email);
  await page.goto(`/briefings/${id}/generating`);
  // replays persisted events → shows COMPLETE + the real streamed body
  await expect(page.getByText(/COMPLETE/i).first()).toBeVisible({ timeout: 30_000 });
  await evidence(page, "p4-live", "generation-resumed");
});
