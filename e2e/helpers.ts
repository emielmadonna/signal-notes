import { Page, expect } from "@playwright/test";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

/** Load .env.local as an optional fallback (mirrors scripts/ loader). */
export function loadEnv(): void {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

export const USERS = {
  // The two org admin accounts (one per org, no overlap).
  northwind: { email: "admin@admin.admin", org: "Northwind Advisory" },
  meridian: { email: "admin2@admin.admin", org: "Meridian Group" },
};

export function seedPassword(): string {
  loadEnv();
  const pw = process.env.SEED_USER_PASSWORD;
  if (!pw) throw new Error("SEED_USER_PASSWORD missing (env or .env.local)");
  return pw;
}

/** Sign in through the real form, like a user would. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel(/email/i).or(page.locator('input[type="email"]')).fill(email);
  await page.locator('input[type="password"]').fill(seedPassword());
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 });
}

/**
 * Grab a real document id owned by the currently signed-in user, the way a
 * user reaches one: open the first document tile and read the id the router
 * lands on. Used by the P5 sweep so the responsive + isolation specs point at
 * a genuine org-scoped id instead of a hard-coded guess.
 */
export async function firstOwnDocumentId(page: Page): Promise<string> {
  await page.goto("/");
  const tile = page
    .locator('main [role="button"][aria-label*="selected"]')
    .first();
  await tile.waitFor({ state: "visible", timeout: 15_000 });
  await tile.hover();
  await page.getByRole("button", { name: /^Open / }).first().click();
  await page.waitForURL(/\/documents\/[0-9a-f-]+/, { timeout: 15_000 });
  const m = page.url().match(/\/documents\/([0-9a-f-]+)/);
  if (!m) throw new Error("could not capture a document id from the workspace");
  return m[1];
}

/**
 * Grab a real COMPLETE briefing id owned by the signed-in user, the way a user
 * reaches one: click a briefing card stamped COMPLETE and read the id the
 * router lands on. Used so the reading-view / generation / responsive / theme
 * specs point at a genuine live briefing instead of a hard-coded id that can
 * be removed during test churn (which is exactly what happened to the original
 * demo briefing — the product was fine; the pinned id was the fragility).
 */
export async function firstCompleteBriefingId(page: Page): Promise<string> {
  await page.goto("/");
  // A complete briefing card carries the "COMPLETE" stamp; its card button
  // routes to /briefings/[id]. Click the first one and capture the id.
  const card = page
    .locator("main")
    .getByRole("button")
    .filter({ hasText: /COMPLETE/ })
    .first();
  await card.waitFor({ state: "visible", timeout: 15_000 });
  await card.click();
  await page.waitForURL(/\/briefings\/[0-9a-f-]+(?!\/generating)/, { timeout: 15_000 });
  const m = page.url().match(/\/briefings\/([0-9a-f-]+)/);
  if (!m) throw new Error("could not capture a complete briefing id from the workspace");
  return m[1];
}

/** Screenshot into shiplog/evidence/<dir>/<name>.png (SHIPLOG references these). */
export async function evidence(page: Page, dir: string, name: string): Promise<void> {
  const target = path.join("shiplog", "evidence", dir);
  mkdirSync(target, { recursive: true });
  await page.screenshot({ path: path.join(target, `${name}.png`), fullPage: false });
}

/**
 * Set the app theme the way the real toggle does: cookie AND localStorage
 * (the client prefers localStorage on conflict, so cookie-only would be
 * re-stamped back on mount).
 */
export async function setTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3100";
  await page.context().addCookies([{ name: "sn-theme", value: theme, url: base }]);
  await page.evaluate((t) => localStorage.setItem("sn-theme", t), theme);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}
