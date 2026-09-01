import { test, expect } from "@playwright/test";
import {
  signIn,
  evidence,
  firstCompleteBriefingId,
  reachGenerationSurfaceOrSkip,
  requireModelKey,
  USERS,
} from "./helpers";

/**
 * What happens when a run FINISHES.
 *
 * Two complaints, one cause between them: a briefing that had completed still
 * looked like one that never would. The surface sat on "COMPLETE" waiting for
 * someone to notice a button, and the reading view then opened with the
 * generation log expanded above the briefing.
 *
 *   1. the generation surface hands off to the reading view on its own
 *   2. the reading view opens with the log COLLAPSED (still one click away)
 */
test.describe.configure({ mode: "serial" });

test("a finished run opens the briefing by itself", async ({ page }) => {
  requireModelKey();
  // A real generation: model turns, tool calls and all.
  test.setTimeout(300_000);
  await signIn(page, USERS.northwind.email);

  // Compose from the first document in the workspace, the way a user does.
  await page.goto("/");
  const tile = page
    .locator('main [role="button"][aria-label*="selected"]')
    .first();
  await tile.waitFor({ state: "visible", timeout: 15_000 });
  await tile.click();
  await page.getByRole("button", { name: /generate/i }).first().click();
  await page.waitForURL(/\/compose/, { timeout: 15_000 });

  await page.getByRole("button", { name: /generate briefing/i }).first().click();

  // The composer hands off to the generation surface…
  await reachGenerationSurfaceOrSkip(page);
  await expect(
    page.getByText(/GENERATING|CONNECTING TO THE RUN/).first()
  ).toBeVisible({ timeout: 30_000 });
  await evidence(page, "p6-generation", "surface-running");

  // …and the surface hands off to the reading view WITHOUT a click. The wait
  // covers the whole model run; the assertion is that the URL changes on its
  // own, which is the thing that was missing.
  await page.waitForURL(/\/briefings\/[0-9a-f-]+$/, { timeout: 240_000 });
  await evidence(page, "p6-generation", "auto-opened-reading-view");

  // It is the reading view, not a husk: the finished briefing is on screen,
  // stamped COMPLETE, with its grounding and its collapsed log below.
  const reader = page.getByRole("dialog");
  await expect(reader).toBeVisible({ timeout: 15_000 });
  await expect(reader.getByText(/COMPLETE/).first()).toBeVisible();
  await expect(reader.getByText("GROUNDED IN")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /generation log/i })
  ).toHaveAttribute("aria-expanded", "false");
});

test("the reading view opens with the generation log collapsed", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  const id = await firstCompleteBriefingId(page);
  await page.goto(`/briefings/${id}`);

  const toggle = page.getByRole("button", { name: /generation log/i });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Collapsed by DEFAULT, not removed — one click still shows the replay.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await evidence(page, "p6-generation", "log-expanded-on-demand");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await evidence(page, "p6-generation", "log-collapsed-by-default");
});
