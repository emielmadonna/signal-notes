// Deployment probe — run BY HAND against a deployed target:
//   E2E_BASE_URL=https://… npx playwright test e2e/_prodprobe.spec.ts
// It writes junk documents through the real route (that is the point), so it
// only runs when a target is named, never in the ordinary suite/CI sweep, and
// it deletes what it wrote afterwards.
import { Client } from "pg";
import { test } from "@playwright/test";
import { loadEnv, signIn, USERS } from "./helpers";

test.skip(
  !process.env.E2E_BASE_URL,
  "Probe of a DEPLOYED target only: set E2E_BASE_URL to run it."
);

const utf8 = (s: string) => Buffer.from(s, "utf8");
const NUL = Buffer.from([0x00]);

const CASES: Array<[string, Buffer]> = [
  ["plain.txt", utf8("Just some plain notes.")],
  ["nul-byte.txt", Buffer.concat([utf8("before"), NUL, utf8("after")])],
  ["pipeline.csv", utf8("a,b\n1,2\n")],
  ["saved-page.html", utf8("<html><body><p>hello there</p></body></html>")],
  ["attachment", utf8("no extension here at all")],
  ["contract.doc", utf8("anything")],
];

test("prod probe", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, USERS.northwind.email);
  for (const [name, buf] of CASES) {
    const res = await page.request.post("/api/documents/upload", {
      multipart: {
        file: { name, mimeType: "application/octet-stream", buffer: buf },
        kind: "other",
        title: `PRODPROBE ${name}`,
      },
      timeout: 60_000,
    });
    const text = await res.text();
    const ct = res.headers()["content-type"] ?? "(none)";
    console.log(
      `PROBE ${res.status()} | ${name} | ct=${ct} | len=${text.length} | ${text.slice(0, 240).replace(/\n/g, " ")}`
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
      "PRODPROBE %",
    ]);
  } finally {
    await client.end();
  }
});
