import { test, expect } from "@playwright/test";
import { signIn, evidence, setTheme, USERS } from "./helpers";

/**
 * P2 visual-evidence run (card 5): photographs every P2 surface in both
 * themes for the side-by-side comparison against the approved canvas, and
 * live-verifies the shell against the real database.
 */

test("sign-in surface: populated, error, expired — both themes", async ({ page }) => {
  await page.goto("/signin");
  await evidence(page, "p2-visual", "signin-dark");
  await expect(page.getByText("Briefings grounded in your own documents.")).toBeVisible();

  // wrong-password error state (real submit, real error, form stays filled)
  await page.locator('input[type="email"]').fill(USERS.ana.email);
  await page.locator('input[type="password"]').fill("definitely-wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('input[type="email"]')).toHaveValue(USERS.ana.email);
  await evidence(page, "p2-visual", "signin-error-dark");

  // expired variant
  await page.goto("/signin?reason=expired");
  await expect(page.getByText("You were signed out.")).toBeVisible();
  await evidence(page, "p2-visual", "signin-expired-dark");

  await setTheme(page, "light");
  await page.goto("/signin");
  await evidence(page, "p2-visual", "signin-light");
});

test("workspace shell live: org name, sections, account menu, theme toggle", async ({ page }) => {
  await signIn(page, USERS.ana.email);
  await expect(page.getByText(USERS.ana.org).first()).toBeVisible({ timeout: 15_000 });
  // documents are seeded → the documents section must NOT show empty or error
  await expect(page.getByText("We couldn't load your documents.")).toHaveCount(0);
  await evidence(page, "p2-visual", "workspace-dark");

  // account menu (open via click)
  await page.getByText(USERS.ana.org).first().click();
  await expect(page.getByText("SIGNED IN AS")).toBeVisible();
  await expect(page.getByText(USERS.ana.email)).toBeVisible();
  await expect(page.getByText("Switch account")).toHaveCount(0); // D3: cut
  await evidence(page, "p2-visual", "workspace-account-menu-dark");
  await page.keyboard.press("Escape");

  // theme toggle persists across reload
  await page.getByRole("button", { name: /light/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await evidence(page, "p2-visual", "workspace-light");
});

test("design gallery: primitives in both themes", async ({ page }) => {
  await signIn(page, USERS.ana.email);
  await page.goto("/design");
  await evidence(page, "p2-visual", "gallery-top-dark");
  await setTheme(page, "dark");
  await page.goto("/design");
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(400);
  await evidence(page, "p2-visual", "gallery-mid-dark");
});

test("not-found + auth wall + 768px", async ({ page }) => {
  // unauthenticated protected path → redirected to signin with next
  await page.goto("/briefings/does-not-exist");
  await expect(page).toHaveURL(/\/signin\?next=/);

  await signIn(page, USERS.ana.email);
  await page.goto("/definitely-not-a-page");
  await expect(page.getByText("This page doesn't exist.")).toBeVisible();
  await evidence(page, "p2-visual", "not-found-dark");

  // responsive floor
  await page.setViewportSize({ width: 768, height: 940 });
  await page.goto("/");
  await evidence(page, "p2-visual", "workspace-768-dark");
});
