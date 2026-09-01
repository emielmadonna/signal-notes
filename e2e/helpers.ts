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
  ana: { email: "ana@northwind-advisory.test", org: "Northwind Advisory" },
  marta: { email: "marta@meridiangroup.test", org: "Meridian Group" },
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
