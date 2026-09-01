import { test } from "@playwright/test";
import { signIn, evidence, USERS } from "./helpers";

// Final 1:1 verification capture — every surface at the canvas's 1440px design
// width, into shiplog/evidence/verify/. Compared by the dispatcher against
// docs/design/canvas/Signal Notes.dc.html.
test.use({ viewport: { width: 1440, height: 940 } });

test("capture every surface at 1440", async ({ page }) => {
  test.setTimeout(240_000);
  // 1. SIGN IN
  await page.goto("/signin");
  await evidence(page, "verify", "01-signin");
  // 2. WORKSPACE (populated: seeded docs)
  await signIn(page, USERS.northwind.email);
  await page.waitForTimeout(1500);
  await evidence(page, "verify", "02-workspace");
  // 3. QUICK MENU (hover New briefing)
  await page.getByRole("button", { name: /New briefing/i }).first().hover();
  await page.waitForTimeout(600);
  await evidence(page, "verify", "03-quick-menu");
  // 4. ADD DOCUMENT sheet
  await page.goto("/documents/new");
  await page.waitForTimeout(800);
  await evidence(page, "verify", "04-add-document");
  // 5. DOCUMENT sheet (open a seeded doc)
  await page.goto("/");
  await page.waitForTimeout(1200);
  const tile = page.locator('main [role="button"][aria-label*="selected"]').first();
  await tile.hover();
  await page.getByRole("button", { name: /^Open / }).first().click();
  await page.waitForURL(/\/documents\/[0-9a-f-]+/);
  await page.waitForTimeout(1000);
  await evidence(page, "verify", "05-document-sheet");
  // 6. COMPOSER (with a selection)
  await page.goto("/");
  await page.waitForTimeout(1000);
  const t2 = page.locator('main [role="button"][aria-label*="selected"]');
  await t2.nth(0).click();
  await t2.nth(1).click();
  await page.goto("/compose");
  await page.waitForTimeout(800);
  await evidence(page, "verify", "06-composer");
  // 7. READING VIEW (the real complete briefing)
  await page.goto("/briefings/345eef7d-ace6-486e-ba49-2d38a4a7f37a");
  await page.waitForTimeout(1500);
  await evidence(page, "verify", "07-reading-view");
  // 8. GENERATION surface (resume the complete briefing's log)
  await page.goto("/briefings/345eef7d-ace6-486e-ba49-2d38a4a7f37a/generating");
  await page.waitForTimeout(2000);
  await evidence(page, "verify", "08-generation");
  // 9. LIGHT THEME workspace
  await page.evaluate(() => { document.cookie = "sn-theme=light; path=/"; localStorage.setItem("sn-theme","light"); });
  await page.goto("/");
  await page.waitForTimeout(1200);
  await evidence(page, "verify", "09-workspace-light");
  // 10. NOT FOUND
  await page.goto("/definitely-nope");
  await page.waitForTimeout(600);
  await evidence(page, "verify", "10-not-found");
});
