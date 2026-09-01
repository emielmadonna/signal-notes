import { test, expect } from "@playwright/test";
import { signIn, USERS } from "./helpers";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/**
 * Document deletion — the two cases p3-documents.spec.ts never covered.
 *
 * Its "delete via selection bar" test deletes exactly ONE document, from a
 * list that is fresh. Both bugs below lived in the gap:
 *
 *   1. MULTI-SELECT delete had no test at all.
 *   2. A STALE TILE (row already deleted elsewhere) reported a red
 *      "This document couldn't be deleted." The delete had in fact already
 *      happened; the workspace just never revalidated, so the tile outlived
 *      its row. The message blamed the delete for the list being out of date.
 *
 * Fixtures are created and removed with the service role so these tests never
 * depend on, or disturb, the seeded documents.
 */

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}

const PREFIX = "ZZDEL-";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function seedFixtures(names: string[]) {
  const admin = adminClient();
  const { data: mem } = await admin
    .from("org_members")
    .select("org_id, user_id")
    .limit(1);
  const { org_id, user_id } = mem![0];
  await admin.from("documents").delete().like("title", `${PREFIX}%`);
  await admin.from("documents").insert(
    names.map((title) => ({
      org_id, title, kind: "other", body: "fixture body",
      file_name: title, ext: "TXT", size_bytes: 1, added_by: user_id,
    }))
  );
  return admin;
}

test("multi-select delete removes every selected document", async ({ page }) => {
  test.setTimeout(90_000);
  const names = [`${PREFIX}a`, `${PREFIX}b`, `${PREFIX}c`];
  const admin = await seedFixtures(names);

  await signIn(page, USERS.northwind.email);
  for (const name of names) {
    await page.locator("main").getByText(name).first().click();
  }
  await expect(page.getByText("3 documents selected")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/Delete 3 documents\?/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();

  await expect(page.locator("main").getByText(PREFIX)).toHaveCount(0, { timeout: 15_000 });
  const { data: left } = await admin.from("documents").select("id").like("title", `${PREFIX}%`);
  expect(left ?? []).toHaveLength(0);
});

test("a tile whose row is already gone deletes cleanly, with no false error", async ({ page }) => {
  test.setTimeout(90_000);
  const names = [`${PREFIX}x`, `${PREFIX}y`];
  const admin = await seedFixtures(names);

  await signIn(page, USERS.northwind.email);
  for (const name of names) {
    await page.locator("main").getByText(name).first().click();
  }
  await expect(page.getByText("2 documents selected")).toBeVisible({ timeout: 15_000 });

  // The rows vanish underneath the open tab — another tab, a teammate, or a
  // test run against the same org. The list has no idea.
  await admin.from("documents").delete().like("title", `${PREFIX}%`);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();

  // Requested end state reached, so it is a success: tiles gone, sheet closed,
  // and NO red failure telling the user something went wrong when it didn't.
  await expect(page.locator("main").getByText(PREFIX)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
  const alerts = await page.locator('[role="alert"]').allInnerTexts();
  expect(alerts.join(" ")).not.toMatch(/couldn't be deleted|Nothing was deleted/i);
});
