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

// ---------------------------------------------------------------------------
// Denial-of-service regressions.
//
// The original implementation stripped markup with lazy, unbounded regexes
// (`<script>[\s\S]*?</script>`, `<!--[\s\S]*?-->`, `<title>…</title>`). Every
// opening token that never closes made the engine scan to end-of-input and
// fail, then repeat at the next one — O(openers x length). Measured on that
// code: 60k unclosed "<script>" plus a 2 MB tail took 19.6 s, and the 5 MB
// case below DID NOT FINISH IN 600 SECONDS. Upload accepts 20 MB of .html and
// neither ingestion route sets a maxDuration, so one request could stall a
// self-hosted server for every user.
//
// These budgets are deliberately loose (seconds, against a ~20 ms reality) so
// they fail on a return to quadratic behaviour, not on a slow CI box.
// ---------------------------------------------------------------------------

function millisFor(html: string): number {
  const started = Date.now();
  extractReadableText(html);
  return Date.now() - started;
}

test("REGRESSION: unclosed <script> tags cannot blow up the extractor", () => {
  // Inside fetch-url's own 5 MB cap. Old code: >600_000 ms. New code: ~17 ms.
  const payload = "<script>".repeat(150_000) + "x".repeat(2_500_000);
  assert.ok(millisFor(payload) < 5_000, "5 MB of unclosed <script> must not hang");
});

test("REGRESSION: unclosed comments and titles cannot blow up the extractor", () => {
  assert.ok(
    millisFor("<!--".repeat(200_000) + "y".repeat(5_000_000)) < 5_000,
    "unterminated comments must not hang"
  );
  assert.ok(
    millisFor("<title>".repeat(200_000) + "z".repeat(5_000_000)) < 5_000,
    "unterminated titles must not hang"
  );
});

test("a 19 MB benign page (the upload cap) stays well inside budget", () => {
  assert.ok(millisFor("<div>hello</div>".repeat(1_200_000)) < 10_000);
});

test("content of a raw-text element is dropped, not emitted as prose", () => {
  const { text } = extractReadableText(
    "<p>before</p><script>var secret = 1;</script><p>after</p>"
  );
  assert.match(text, /before/);
  assert.match(text, /after/);
  assert.doesNotMatch(text, /secret/);
});

test("a tag that merely starts like a raw-text element is still unwrapped", () => {
  // <scriptish> is not <script>; its text must survive.
  const { text } = extractReadableText("<scriptish>keep me</scriptish>");
  assert.match(text, /keep me/);
});

test("text after an unclosed <script> is still recovered", () => {
  // The old regex simply failed to match and left the text in place; the
  // scanner must not silently swallow the rest of the document instead.
  const { text } = extractReadableText("<p>alpha</p><script><p>beta</p>");
  assert.match(text, /alpha/);
  assert.match(text, /beta/);
});
