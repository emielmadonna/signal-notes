/**
 * db-query.ts — run one SQL query against DATABASE_URL and print rows.
 *
 * Harness helper: this machine has no psql, so scripts/constitution.sh routes
 * its live-database checks through this file instead. Read-only by convention:
 * the verifier only sends SELECTs. Output: one row per line, columns
 * tab-separated (mirrors `psql -At` closely enough for the verifier's greps).
 *
 * Usage: npx tsx scripts/db-query.ts "select ..."
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";

function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return; // no .env.local (e.g. CI, where DATABASE_URL comes from secrets)
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const sql = process.argv[2];
if (!sql) {
  console.error("usage: npx tsx scripts/db-query.ts \"<sql>\"");
  process.exit(2);
}

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (env or .env.local)");
  process.exit(2);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
client
  .connect()
  .then(() => client.query({ text: sql, rowMode: "array" }))
  .then((res) => {
    for (const row of res.rows) {
      console.log(row.map((v: unknown) => (v === null ? "" : String(v))).join("\t"));
    }
    return client.end();
  })
  .catch((err: Error) => {
    console.error(`query failed: ${err.message}`);
    process.exit(1);
  });
