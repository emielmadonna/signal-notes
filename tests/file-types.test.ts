// Unit tests for lib/ingest/file-types.ts — what the uploader accepts, how it
// classifies a file, and what a refusal tells the user to do instead.
//
// The old route knew five extensions and answered every other file with one
// sentence naming those five. Real workspaces are full of .csv exports, saved
// .html pages, .vtt transcripts and downloads with no extension at all, and
// each of those was a dead end (catch #24).
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_SUMMARY,
  EXT_LABELS,
  extensionOf,
  fileNameStem,
  refusalFor,
  typeFromContent,
  typeFromFileName,
} from "@/lib/ingest/file-types";

const bytes = (s: string) => new TextEncoder().encode(s);

test("the formats with a real parser keep their strategy", () => {
  assert.deepEqual(typeFromFileName("q3.pdf"), { label: "PDF", strategy: "pdf" });
  assert.deepEqual(typeFromFileName("notes.docx"), { label: "DOCX", strategy: "docx" });
  assert.deepEqual(typeFromFileName("memo.rtf"), { label: "RTF", strategy: "rtf" });
  assert.deepEqual(typeFromFileName("page.html"), { label: "HTML", strategy: "html" });
});

test("the whole plain-text family is accepted, not just .txt and .md", () => {
  for (const name of [
    "export.csv",
    "export.tsv",
    "payload.json",
    "feed.xml",
    "config.yaml",
    "config.yml",
    "server.log",
    "call.vtt",
    "call.srt",
  ]) {
    const type = typeFromFileName(name);
    assert.notEqual(type, null, `${name} should be accepted`);
    assert.equal(type?.strategy, "text", `${name} should read as text`);
  }
});

test("alternate spellings collapse onto one label", () => {
  assert.equal(typeFromFileName("a.markdown")?.label, "MD");
  assert.equal(typeFromFileName("a.mdx")?.label, "MD");
  assert.equal(typeFromFileName("a.text")?.label, "TXT");
  assert.equal(typeFromFileName("a.htm")?.label, "HTML");
  assert.equal(typeFromFileName("a.ndjson")?.label, "JSON");
});

test("the extension match is case-insensitive", () => {
  assert.equal(typeFromFileName("SCAN.PDF")?.label, "PDF");
  assert.equal(typeFromFileName("Notes.DocX")?.label, "DOCX");
});

test("a format we cannot read gets a NAMED way out, not a generic refusal", () => {
  const doc = refusalFor("contract.doc");
  assert.ok(doc, "a .doc should have its own message");
  assert.match(doc!, /\.docx/, "it should say what to save it as");

  assert.match(refusalFor("budget.xlsx")!, /CSV/);
  assert.match(refusalFor("deck.pptx")!, /PDF/);
  assert.match(refusalFor("interview.mp3")!, /transcript/i);
  assert.equal(refusalFor("notes.pdf"), null, "an accepted type has no refusal");
});

test("REGRESSION: a file with no extension is classified by its BYTES", () => {
  // A download called "attachment" is still a PDF; refusing it was wrong.
  assert.equal(typeFromFileName("attachment"), null);
  assert.deepEqual(typeFromContent(bytes("%PDF-1.7\nstuff")), {
    label: "PDF",
    strategy: "pdf",
  });
  assert.deepEqual(typeFromContent(bytes("{\\rtf1\\ansi hello}")), {
    label: "RTF",
    strategy: "rtf",
  });
  assert.deepEqual(
    typeFromContent(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])),
    { label: "DOCX", strategy: "docx" }
  );
});

test("sniffed plain text and sniffed markup are told apart", () => {
  assert.equal(typeFromContent(bytes("Just some notes from the call."))?.label, "TXT");
  assert.equal(
    typeFromContent(bytes("<!DOCTYPE html><html><body>hi</body></html>"))?.label,
    "HTML"
  );
});

test("binary that is not a format we know is still refused", () => {
  // A JPEG header — the e2e suite's 415 case. Sniffing must not let it in.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  assert.equal(typeFromContent(jpeg), null);
  // Random high-entropy bytes are not text either.
  const noise = new Uint8Array(256);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 7 + 3) % 256;
  assert.equal(typeFromContent(noise), null);
  assert.equal(typeFromContent(new Uint8Array(0)), null);
});

test("extensionOf and fileNameStem handle dotted and undotted names", () => {
  assert.equal(extensionOf("a.b.c.PDF"), "pdf");
  assert.equal(extensionOf("no-extension"), "");
  assert.equal(extensionOf("trailing."), "");
  assert.equal(fileNameStem("quarterly-notes.pdf"), "quarterly-notes");
  assert.equal(fileNameStem("no-extension"), "no-extension");
  assert.equal(fileNameStem(".gitignore"), ".gitignore");
});

test("the accept attribute and the human summary cover the same table", () => {
  // Every label the table can emit must be spelled out for the user, or the
  // drop zone is promising less than the route accepts.
  for (const label of EXT_LABELS) {
    assert.ok(
      ACCEPTED_SUMMARY.includes(label),
      `${label} is accepted but missing from ACCEPTED_SUMMARY`
    );
  }
  assert.ok(ACCEPT_ATTRIBUTE.includes(".pdf"));
  assert.ok(ACCEPT_ATTRIBUTE.includes(".csv"));
  assert.ok(ACCEPT_ATTRIBUTE.includes(".vtt"));
  assert.ok(!ACCEPT_ATTRIBUTE.includes(".doc,"), "a .doc must not be offered");
});

test("every label the table emits is one migration 0004 allows", () => {
  // The DB CHECK is the thing that turns a mismatch into a 500, so the two
  // lists are asserted against each other here rather than trusted to stay
  // in sync by hand.
  const allowedByMigration = new Set([
    "PDF", "DOCX", "RTF", "HTML",
    "TXT", "MD", "CSV", "TSV", "JSON", "XML", "YAML", "LOG",
    "SRT", "VTT",
    "WEB",
  ]);
  for (const label of EXT_LABELS) {
    assert.ok(
      allowedByMigration.has(label),
      `${label} would violate documents_ext_check`
    );
  }
});
