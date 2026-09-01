import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { signIn, evidence, loadEnv, USERS } from "./helpers";

/**
 * Document ingestion, part 2 — the two live defects behind "uploading doesn't
 * work, it gives me 500 errors", proven against the real route, the real
 * parsers and the live database.
 *
 *   catch #23  extracted text carrying a NUL or a lone surrogate was rejected
 *              by Postgres/PostgREST and surfaced as 500 "Saving the document
 *              failed". Both are now stripped before the insert.
 *   catch #24  only five extensions were accepted, so .csv, .html, .vtt, .json
 *              and a file with no extension at all were dead ends.
 *
 * The 415 path is asserted too: widening what we accept must not quietly start
 * accepting things we cannot read.
 */
test.describe.configure({ mode: "serial" });

type Case = {
  name: string;
  /** Bytes to post, built without any literal control characters in source. */
  body: () => Buffer;
  expectStatus: number;
  /** For a 200: the ext label the row must carry. */
  expectExt?: string;
  /** For a 200: text that must survive into the stored body. */
  expectBody?: RegExp;
  /** For a non-200: what the human message must mention. */
  expectError?: RegExp;
};

const NUL = Buffer.from([0x00]);
const utf8 = (s: string) => Buffer.from(s, "utf8");

const CASES: Case[] = [
  // --- catch #23: characters Postgres cannot hold --------------------------
  {
    name: "nul-byte.txt",
    body: () =>
      Buffer.concat([utf8("Interview with Dana"), NUL, utf8(" about renewals.")]),
    expectStatus: 200,
    expectExt: "TXT",
    expectBody: /Interview with Dana about renewals\./,
  },
  {
    name: "lone-surrogate.rtf",
    // 唵7 is 0xD83D — a high surrogate with no partner, which is exactly
    // what a real RTF emits for half an emoji.
    body: () => utf8("{\\rtf1\\ansi Dana said \\u55357 ? renewals are slipping.}"),
    expectStatus: 200,
    expectExt: "RTF",
    expectBody: /renewals are slipping/,
  },
  // --- catch #24: formats we can read but used to refuse --------------------
  {
    name: "pipeline.csv",
    body: () => utf8("account,stage,note\nAcme,Renewal,Budget approved\n"),
    expectStatus: 200,
    expectExt: "CSV",
    expectBody: /Budget approved/,
  },
  {
    name: "saved-page.html",
    body: () =>
      utf8(
        "<!DOCTYPE html><html><head><title>Pricing</title>" +
          "<script>var noise = 1;</script></head>" +
          "<body><p>Our pricing starts at forty dollars.</p></body></html>"
      ),
    expectStatus: 200,
    expectExt: "HTML",
    expectBody: /Our pricing starts at forty dollars\./,
  },
  {
    name: "call.vtt",
    body: () =>
      utf8("WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWe need this closed by Q3.\n"),
    expectStatus: 200,
    expectExt: "VTT",
    expectBody: /We need this closed by Q3\./,
  },
  {
    name: "export.json",
    body: () => utf8('{"summary":"Churn risk is concentrated in mid-market."}'),
    expectStatus: 200,
    expectExt: "JSON",
    expectBody: /Churn risk is concentrated in mid-market\./,
  },
  {
    name: "notes.md",
    body: () => utf8("# Kickoff\n\nThey want a pilot before signing.\n"),
    expectStatus: 200,
    expectExt: "MD",
    expectBody: /They want a pilot before signing\./,
  },
  // A download with NO extension: classified by its bytes, not refused.
  {
    name: "attachment",
    body: () => utf8("Plain notes from a download with no extension at all."),
    expectStatus: 200,
    expectExt: "TXT",
    expectBody: /no extension at all/,
  },
  // --- still refused, and still helpfully --------------------------------
  {
    name: "contract.doc",
    body: () => utf8("anything"),
    expectStatus: 415,
    expectError: /\.docx/,
  },
  {
    name: "photo.jpeg",
    body: () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
    expectStatus: 415,
    expectError: /couldn't read|can read/i,
  },
  {
    name: "empty.txt",
    body: () => Buffer.alloc(0),
    expectStatus: 422,
    expectError: /empty/i,
  },
];

test("ingestion: every supported type lands, every refusal explains itself", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, USERS.northwind.email);

  const created: string[] = [];
  const failures: string[] = [];

  for (const c of CASES) {
    const title = `E2E ingest ${c.name}`;
    const res = await page.request.post("/api/documents/upload", {
      multipart: {
        file: {
          name: c.name,
          mimeType: "application/octet-stream",
          buffer: c.body(),
        },
        kind: "other",
        title,
      },
      timeout: 60_000,
    });
    const payload = (await res.json()) as {
      document?: { id: string; ext: string };
      error?: string;
    };

    if (res.status() !== c.expectStatus) {
      failures.push(
        `${c.name}: expected ${c.expectStatus}, got ${res.status()} — ${
          payload.error ?? "(no error message)"
        }`
      );
      continue;
    }

    if (c.expectStatus === 200) {
      if (!payload.document) {
        failures.push(`${c.name}: 200 with no document in the body`);
        continue;
      }
      created.push(payload.document.id);
      if (payload.document.ext !== c.expectExt) {
        failures.push(
          `${c.name}: expected ext ${c.expectExt}, got ${payload.document.ext}`
        );
      }
    } else if (c.expectError && !c.expectError.test(payload.error ?? "")) {
      failures.push(
        `${c.name}: message did not match ${c.expectError} — got "${payload.error}"`
      );
    }
  }

  // Report every mismatch at once rather than dying on the first.
  expect(failures, failures.join("\n")).toEqual([]);

  // The stored bodies are the real proof: the text survived extraction AND
  // sanitizing. Read them back through the UI the way a user would.
  for (const c of CASES) {
    if (c.expectStatus !== 200 || !c.expectBody) continue;
    const id = created.shift();
    if (!id) continue;
    await page.goto(`/documents/${id}`);
    await expect(page.getByText(c.expectBody)).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/");
  await evidence(page, "p6-ingestion", "mixed-types-in-workspace");
});

/**
 * Leave the org as we found it. The documents above are real rows written
 * through the real route (which is the point), so the suite has to clear them
 * or every run adds eleven more. Cleanup goes straight to the database rather
 * than clicking eight delete confirmations — this is harness housekeeping, not
 * a product path, and the product's own delete is already covered by p3.
 */
test.afterAll(async () => {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) return; // CI without a DB URL: nothing was created either.
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("delete from public.documents where title like $1", [
      "E2E ingest %",
    ]);
  } finally {
    await client.end();
  }
});
