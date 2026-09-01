// Deployment probe for the RICH formats (PDF/DOCX/RTF) — the lazy PDF-engine
// path that once crashed only in production. Run BY HAND against a deployed
// target:
//   E2E_BASE_URL=https://… npx playwright test e2e/_pdfprobe.spec.ts
// Signs in as the second org's admin so it spends that user's upload budget,
// and deletes the documents it wrote afterwards.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { test } from "@playwright/test";
import { loadEnv, signIn, USERS } from "./helpers";

test.skip(
  !process.env.E2E_BASE_URL,
  "Probe of a DEPLOYED target only: set E2E_BASE_URL to run it."
);

const FIXTURES = ["e2e-upload.pdf", "e2e-upload.docx", "e2e-upload.rtf"];

test("prod pdf/docx/rtf probe", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, USERS.meridian.email);
  for (const name of FIXTURES) {
    const buffer = readFileSync(path.join(__dirname, "fixtures", name));
    const res = await page.request.post("/api/documents/upload", {
      multipart: {
        file: { name, mimeType: "application/octet-stream", buffer },
        kind: "other",
        title: `PDFPROBE ${name}`,
      },
      timeout: 60_000,
    });
    const text = await res.text();
    console.log(
      `PROBE ${res.status()} | ${name} | ${text.slice(0, 200).replace(/\n/g, " ")}`
    );
  }
});

// Leave the org as we found it (same pattern as p6-ingestion's afterAll).
test.afterAll(async () => {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("delete from public.documents where title like $1", [
      "PDFPROBE %",
    ]);
  } finally {
    await client.end();
  }
});
