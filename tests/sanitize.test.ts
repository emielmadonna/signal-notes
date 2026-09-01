// Unit tests for lib/ingest/sanitize.ts — the gate between "text we extracted"
// and "text Postgres will accept".
//
// These are regression tests for two REPRODUCED 500s (catch #23). Both were
// found by posting real files at the live upload route, and both returned
// `500 Saving the document failed` with the driver's own words:
//
//   nul-byte.txt       -> "unsupported Unicode escape sequence"
//   lone-surrogate.rtf -> "Empty or invalid json"
//
// The assertions below encode exactly what must never reach an insert again.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDocumentText, sanitizeLine } from "@/lib/ingest/sanitize";

const NUL = "\u0000";
const HIGH_SURROGATE = "\uD83D"; // the first half of an emoji, alone
const LOW_SURROGATE = "\uDE00"; // the second half, alone

test("REGRESSION: a NUL byte is removed (Postgres text cannot hold one)", () => {
  const out = sanitizeDocumentText(`before${NUL}after`);
  assert.equal(out, "beforeafter");
  assert.ok(!out.includes(NUL));
});

test("REGRESSION: a lone surrogate becomes U+FFFD, so JSON can encode it", () => {
  const out = sanitizeDocumentText(`quote ${HIGH_SURROGATE} end`);
  assert.equal(out, "quote � end");
  // The real test: the value survives the JSON round-trip the insert performs.
  assert.doesNotThrow(() => JSON.parse(JSON.stringify({ body: out })));
  assert.equal(JSON.parse(JSON.stringify({ body: out })).body, out);
});

test("a stray LOW surrogate is caught too, not just a high one", () => {
  assert.equal(sanitizeDocumentText(`a${LOW_SURROGATE}b`), "a�b");
});

test("a VALID surrogate pair is left completely alone", () => {
  // 😀 is a legitimate pair; sanitizing must not break real characters.
  const emoji = `${HIGH_SURROGATE}${LOW_SURROGATE}`;
  assert.equal(sanitizeDocumentText(`hi ${emoji} there`), `hi ${emoji} there`);
  assert.equal(sanitizeDocumentText("café — naïve — 日本語"), "café — naïve — 日本語");
});

test("tabs and newlines survive; other control characters do not", () => {
  assert.equal(
    sanitizeDocumentText("col1\tcol2\nrow"),
    "col1\tcol2\nrow"
  );
});

test("line endings are normalized to \\n", () => {
  assert.equal(sanitizeDocumentText("a\r\nb\rc"), "a\nb\nc");
});

test("sanitizing does NOT trim — the caller decides what empty means", () => {
  assert.equal(sanitizeDocumentText("  padded  "), "  padded  ");
});

test("a document that is ONLY unusable characters sanitizes to empty", () => {
  // This is what turns a junk file into an honest 422 instead of a 500.
  assert.equal(sanitizeDocumentText(`${NUL}`).trim(), "");
});

test("sanitizeLine collapses whitespace and strips the same characters", () => {
  assert.equal(sanitizeLine(`  my${NUL}  file \n name  `), "my file name");
  assert.equal(sanitizeLine(`title ${HIGH_SURROGATE}`), "title �");
});
