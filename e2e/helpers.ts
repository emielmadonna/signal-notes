import { Page, expect, test } from "@playwright/test";
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

/**
 * Guard for the tests that drive a REAL model run.
 *
 * Without ANTHROPIC_API_KEY the SDK cannot authenticate; the engine writes its
 * honest "this briefing didn't finish", and the test then waits out its full
 * timeout for a COMPLETE that can never arrive — ten minutes of CI spent
 * reporting an unset secret as though it were a product defect.
 *
 * This SKIPS those tests when the key is absent, and ONLY then: with the key
 * present nothing about them changes, and nothing is asserted more weakly. A
 * skip is the truthful state — "this path was not exercised" — rather than
 * either a false green or a misleading red, and the CI job annotates the run
 * with a warning so an unset secret cannot pass unnoticed.
 */
export function requireModelKey(): void {
  loadEnv();
  test.skip(
    !process.env.ANTHROPIC_API_KEY,
    "ANTHROPIC_API_KEY is not set, so no real generation can run. Add it as a repository secret to exercise this path."
  );
}

/**
 * Wait for a just-clicked "Generate briefing" to reach the generation surface
 * — or SKIP the test if the run was refused by the rate limiter.
 *
 * Migration 0003 meters generation at 10 per hour per user, and this suite
 * spends two of them on every full run against a single seeded account. So a
 * developer (or CI) running the suite a few times in an hour will legitimately
 * be refused, and the truthful report of that is "this path was not
 * exercised", not "the product is broken" — the 429 is the control working
 * exactly as designed.
 *
 * The skip is conditioned on OBSERVING the limiter's own message, never on a
 * generic failure: anything else still fails the test.
 */
export async function reachGenerationSurfaceOrSkip(page: Page): Promise<void> {
  const never = new Promise<never>(() => {});
  const arrived = page
    .waitForURL(/\/briefings\/[0-9a-f-]+\/generating/, { timeout: 30_000 })
    .then(() => "arrived" as const)
    .catch(() => never);
  const refused = page
    .getByText(/hourly limit on briefing generations/i)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .then(() => "refused" as const)
    .catch(() => never);
  const timedOut = new Promise<"timeout">((r) =>
    setTimeout(() => r("timeout"), 31_000)
  );

  const outcome = await Promise.race([arrived, refused, timedOut]);
  test.skip(
    outcome === "refused",
    "The generation rate limit (10/hour, migration 0003) refused this run, so the live path was not exercised. Wait for the window to roll over and re-run."
  );
  expect(
    outcome,
    "generate was clicked but the generation surface never opened"
  ).toBe("arrived");
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

/**
 * Screenshot for the record.
 *
 * By DEFAULT this writes to shiplog/runs/<dir>/<name>.png, which is gitignored.
 * Set EVIDENCE_PROMOTE=1 to write to shiplog/evidence/<dir>/<name>.png instead
 * — the tracked location the SHIPLOG and the Change Cards cite by name.
 *
 * The split exists because these PNGs are REGENERATED by every run. Writing
 * them straight into tracked paths meant that merely verifying the app left
 * ~25 modified binaries in the working tree, which trains everyone to `git add
 * -A` past them — and the repo had 5.5 MB of screenshots with an 11 MB .git to
 * show for it. Deleting the committed ones was not an option: approved cards
 * cite them, and dead evidence pointers are catches #20 and #21 in this
 * project's own log. So the committed set stays frozen exactly as approved,
 * and routine runs stop touching it.
 *
 * Capturing NEW evidence for a card is therefore a deliberate act:
 *   EVIDENCE_PROMOTE=1 npx playwright test e2e/p5-upload.spec.ts
 * then `git add` the specific files the card cites.
 */
export async function evidence(page: Page, dir: string, name: string): Promise<void> {
  const promote = process.env.EVIDENCE_PROMOTE === "1";
  const target = promote
    ? path.join("shiplog", "evidence", dir)
    : path.join("shiplog", "runs", dir);
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
