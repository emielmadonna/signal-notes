import { test, expect } from "@playwright/test";
import { signIn, evidence, setTheme, USERS } from "./helpers";

/**
 * P5 card-013 — THEME toggle (DESIGN-SPEC §1: two themes, dark default,
 * persisted). Dark is the default; the header toggle flips <html data-theme>
 * and persists it (cookie + localStorage) so a reload keeps the choice.
 *
 * Workspace: exercised through the REAL header button, both directions, with a
 * reload after each to prove persistence.
 * Reading view: has no in-view toggle, so it is driven through the same
 * persistence mechanism the toggle writes (setTheme = cookie + localStorage +
 * reload). Both themes are asserted on <html> and photographed.
 */

const COMPLETE_BRIEFING = "345eef7d-ace6-486e-ba49-2d38a4a7f37a";

test("workspace: real toggle flips data-theme both ways and persists across reload", async ({
  page,
}) => {
  await signIn(page, USERS.ana.email);
  await expect(page.getByText(USERS.ana.org).first()).toBeVisible({
    timeout: 15_000,
  });
  // Dark is the default.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // → light (button reads "Light" while in dark).
  await page.getByRole("button", { name: /light/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await evidence(page, "p5-theme", "workspace-light");

  // → back to dark (button now reads "Dark").
  await page.getByRole("button", { name: /dark/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await evidence(page, "p5-theme", "workspace-dark");
});

test("reading view: both themes apply on <html>, persist across reload, and are photographed", async ({
  page,
}) => {
  await signIn(page, USERS.ana.email);
  await page.goto(`/briefings/${COMPLETE_BRIEFING}`);
  await expect(
    page.getByRole("heading", { name: /Three Conversations, One Pattern/i })
  ).toBeVisible({ timeout: 20_000 });

  // LIGHT — setTheme writes the cookie + localStorage the toggle would, then
  // reloads; the server renders the chosen theme with no flash.
  await setTheme(page, "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("heading", { name: /Three Conversations, One Pattern/i })
  ).toBeVisible({ timeout: 20_000 });
  // Persists across a second reload.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await evidence(page, "p5-theme", "reading-view-light");

  // DARK.
  await setTheme(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await evidence(page, "p5-theme", "reading-view-dark");
});
