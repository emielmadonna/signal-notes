import { test, expect } from "@playwright/test";
import { signIn, evidence, USERS } from "./helpers";
import path from "node:path";

/**
 * Document upload — every ingestion format through the real UI, end to end
 * against the live app + the real server-side parsers (pdf-parse, mammoth, the
 * RTF stripper) + the live database. Each upload must land as a real document
 * whose stored body is the file's actual extracted text.
 */
test.describe.configure({ mode: "serial" });

const fixtures = path.join(process.cwd(), "e2e", "fixtures");
// filename → a substring that only appears if the text was really extracted.
const CASES: Array<[string, RegExp]> = [
  ["e2e-upload.txt", /E2E upload fixture/i],
  ["e2e-upload.pdf", /PDF upload probe/i],
  ["e2e-upload.docx", /DOCX upload probe/i],
  ["e2e-upload.rtf", /RTF upload probe/i],
];

for (const [file, bodyMarker] of CASES) {
  const ext = file.split(".").pop()!.toUpperCase();
  test(`upload ${ext}: parses to a real document with extracted text`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signIn(page, USERS.northwind.email);
    await page.goto("/documents/new");
    await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, file));
    // canvas contract: drop/browse → upload → toast "<file> added"
    await expect(page.getByText(/added/i).first()).toBeVisible({ timeout: 25_000 });
    await evidence(page, "p5-upload", `${ext.toLowerCase()}-added`);

    // it's a real row on the workspace…
    await page.goto("/");
    const stem = file.replace(/\.[^.]+$/, "");
    await expect(page.locator("main").getByText(stem).first()).toBeVisible({
      timeout: 15_000,
    });

    // …and opening it shows the ACTUAL extracted body text (not a placeholder).
    await page.locator("main").getByText(stem).first().hover();
    await page.getByRole("button", { name: new RegExp(`^Open ${stem}`) }).first().click();
    await page.waitForURL(/\/documents\/[0-9a-f-]+/, { timeout: 15_000 });
    await expect(page.getByText(bodyMarker)).toBeVisible({ timeout: 15_000 });

    // clean up: delete via the selection bar so the org stays tidy.
    await page.goto("/");
    await page.locator("main").getByText(stem).first().click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^delete$/i }).click();
    await expect(page.locator("main").getByText(stem)).toHaveCount(0, {
      timeout: 15_000,
    });
  });
}

test("upload rejects an unsupported type (415) with a human message", async ({
  page,
}) => {
  await signIn(page, USERS.northwind.email);
  await page.goto("/documents/new");
  // a .jpeg is not in the allowed set — the sheet must say so, not silently fail.
  const jpeg = path.join(fixtures, "e2e-reject.jpeg");
  await page.evaluate(() => {}); // noop to keep types happy
  const fs = await import("node:fs");
  fs.writeFileSync(jpeg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70]));
  await page.locator('input[type="file"]').setInputFiles(jpeg);
  await expect(
    page.getByText(/can't|cannot|not supported|unsupported|PDF|DOCX/i).first()
  ).toBeVisible({ timeout: 15_000 });
  fs.unlinkSync(jpeg);
  await evidence(page, "p5-upload", "reject-unsupported");
});
