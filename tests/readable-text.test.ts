// Unit tests for lib/html/readable-text.ts — the extractor that runs on bytes
// a stranger's web server chose. Its contract is "never throw", because the
// route calls it outside a try/catch and Next turns a throw into an
// empty-bodied 500 (which the constitution's R3 forbids).
import test from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, extractReadableText } from "@/lib/html/readable-text";

test("REGRESSION: an out-of-range numeric entity does not throw", () => {
  // String.fromCodePoint(0xFFFFFFFF) raises RangeError. The old code called it
  // unguarded, so this exact page content produced an empty 500.
  assert.doesNotThrow(() => decodeEntities("&#xFFFFFFFF;"));
  assert.doesNotThrow(() => decodeEntities("&#999999999;"));
  assert.doesNotThrow(() => decodeEntities("&#x110000;"));
  assert.doesNotThrow(() => extractReadableText("<p>&#xFFFFFFFF;</p>"));
});

test("an undecodable entity is left as the literal text the page sent", () => {
  assert.equal(decodeEntities("&#xFFFFFFFF;"), "&#xFFFFFFFF;");
  assert.equal(decodeEntities("&#x110000;"), "&#x110000;");
});

test("lone surrogates are refused rather than producing broken text", () => {
  // U+D800 alone is not a scalar value; fromCodePoint rejects it, and a lone
  // surrogate in a string breaks JSON encoding on the way to Postgres.
  assert.equal(decodeEntities("&#xD800;"), "&#xD800;");
  assert.equal(decodeEntities("&#55296;"), "&#55296;");
});

test("valid entities still decode, including astral ones", () => {
  assert.equal(decodeEntities("&amp;"), "&");
  assert.equal(decodeEntities("&#x2014;"), "—");
  assert.equal(decodeEntities("&#8212;"), "—");
  assert.equal(decodeEntities("&#x1F600;"), "\u{1F600}");
  assert.equal(decodeEntities("&notareal;"), "&notareal;");
});

test("extracts prose and drops scripts, styles and markup", () => {
  const { text, pageTitle } = extractReadableText(
    `<html><head><title>  Quarterly  Report </title>
     <style>p{color:red}</style><script>alert(1)</script></head>
     <body><h1>Findings</h1><p>Revenue rose 12%.</p><p>Costs fell.</p>
     <!-- hidden --></body></html>`
  );
  assert.equal(pageTitle, "Quarterly Report");
  assert.match(text, /Findings/);
  assert.match(text, /Revenue rose 12%\./);
  assert.doesNotMatch(text, /alert\(1\)/);
  assert.doesNotMatch(text, /color:red/);
  assert.doesNotMatch(text, /hidden/);
  assert.doesNotMatch(text, /</);
});

test("a page with no readable text yields an empty string, not a throw", () => {
  const { text } = extractReadableText("<script>var a=1;</script>");
  assert.equal(text, "");
});

test("a title-less page reports a null title", () => {
  assert.equal(extractReadableText("<p>hi</p>").pageTitle, null);
});
