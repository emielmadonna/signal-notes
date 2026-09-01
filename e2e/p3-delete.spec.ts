import { test, expect } from "@playwright/test";
import { signIn, USERS, loadEnv, seedPassword } from "./helpers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Document deletion — the two cases p3-documents.spec.ts never covered.
 *
 * Its "delete via selection bar" test deletes exactly ONE document from a
 * list that is fresh. Both bugs below lived in that gap:
 *
 *   1. MULTI-SELECT delete had no test at all.
 *   2. A STALE TILE (row already deleted elsewhere) reported a red
 *      "This document couldn't be deleted." The delete had in fact already
 *      happened; the workspace never revalidated, so the tile outlived its
 *      row and the message blamed the delete for the list being out of date.
 *
 * Fixtures are created and removed AS THE SIGNED-IN USER through the anon
 * key — deliberately not the service role. The first version of this file
 * used the service role and read .env.local at module load, which passed on a
 * dev machine and broke CI twice over: .env.local does not exist there
 * (ENOENT at import time, before any test ran) and SUPABASE_SERVICE_ROLE_KEY
 * is not among the job's secrets. Nothing here needs privileges the product's
 * own RLS policies do not already grant this user, so it should not ask for
 * any — and now the suite runs identically in both places.
 */

const PREFIX = "ZZDEL-";

/** A second client for the same user, so rows can be changed out of band. */
async function userClient(): Promise<{ db: SupabaseClient; orgId: string }> {
  loadEnv();
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await db.auth.signInWithPassword({
    email: USERS.northwind.email,
    password: seedPassword(),
  });
  if (error) throw error;
  const { data: mem, error: memError } = await db
    .from("org_members")
    .select("org_id") // named column (R2)
    .eq("user_id", data.user!.id)
    .limit(1);
  if (memError) throw memError;
  return { db, orgId: mem![0].org_id as string };
}

async function removeFixtures(db: SupabaseClient): Promise<void> {
  const { error } = await db.from("documents").delete().like("title", `${PREFIX}%`);
  if (error) throw error;
}

async function seedFixtures(names: string[]): Promise<SupabaseClient> {
  const { db, orgId } = await userClient();
  await removeFixtures(db);
  const { error } = await db.from("documents").insert(
    names.map((title) => ({
      org_id: orgId, title, kind: "other", body: "fixture body",
      file_name: title, ext: "TXT", size_bytes: 1,
    }))
  );
  if (error) throw error;
  return db;
}

test("multi-select delete removes every selected document", async ({ page }) => {
  test.setTimeout(90_000);
  const names = [`${PREFIX}a`, `${PREFIX}b`, `${PREFIX}c`];
  const db = await seedFixtures(names);

  await signIn(page, USERS.northwind.email);
  for (const name of names) {
    await page.locator("main").getByText(name).first().click();
  }
  await expect(page.getByText("3 documents selected")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(/Delete 3 documents\?/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();

  await expect(page.locator("main").getByText(PREFIX)).toHaveCount(0, { timeout: 15_000 });
  const { data: left } = await db.from("documents").select("id").like("title", `${PREFIX}%`);
  expect(left ?? []).toHaveLength(0);
});

test("a tile whose row is already gone deletes cleanly, with no false error", async ({ page }) => {
  test.setTimeout(90_000);
  const names = [`${PREFIX}x`, `${PREFIX}y`];
  const db = await seedFixtures(names);

  await signIn(page, USERS.northwind.email);
  for (const name of names) {
    await page.locator("main").getByText(name).first().click();
  }
  await expect(page.getByText("2 documents selected")).toBeVisible({ timeout: 15_000 });

  // The rows vanish underneath the open tab — another tab, a teammate, or a
  // test run against the same org. The list has no idea.
  await removeFixtures(db);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();

  // The requested end state is reached, so this is a success: tiles gone,
  // sheet closed, and NO red failure claiming something went wrong.
  await expect(page.locator("main").getByText(PREFIX)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
  const alerts = await page.locator('[role="alert"]').allInnerTexts();
  expect(alerts.join(" ")).not.toMatch(/couldn't be deleted|Nothing was deleted/i);
});
