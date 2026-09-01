// lib/ingest/file-types.ts — the single source of truth for WHICH files the
// uploader accepts, how each one is read, and what a rejection says.
//
// The rule behind the table: accept every format we can genuinely turn into
// the document's real text with what is already in the box —
//   * PDF via pdf-parse, DOCX via mammoth, RTF via the hand-rolled stripper,
//   * HTML via the same extractor the web-fetch route uses,
//   * and the whole plain-text family (notes, transcripts, subtitles, data
//     exports, config) which is text the moment it is UTF-8 decoded.
// Anything we cannot read is refused with a message that says what to do
// instead, never a generic "unsupported".
//
// `label` is what lands in documents.ext (migration 0004 widened the CHECK
// constraint to exactly this set) and what the FileIcon prints.
// (0003 is the hardening migration — audit-actor trigger, updated_at, rate
// limits — and has nothing to do with document types.)

/** How the upload route turns bytes into text. */
export type ParseStrategy = "pdf" | "docx" | "rtf" | "html" | "text";

/** The value stored in documents.ext — keep in sync with migration 0004. */
export type ExtLabel =
  | "PDF"
  | "DOCX"
  | "RTF"
  | "TXT"
  | "MD"
  | "CSV"
  | "TSV"
  | "JSON"
  | "XML"
  | "YAML"
  | "HTML"
  | "SRT"
  | "VTT"
  | "LOG"
  | "WEB";

export type AcceptedType = { label: ExtLabel; strategy: ParseStrategy };

/**
 * Filename extension (lower-case, no dot) → how to read it and what to call
 * it. Several spellings deliberately collapse onto one label: a .markdown and
 * a .md are the same document to a reader.
 */
const ACCEPTED: Record<string, AcceptedType> = {
  // Rich formats with a real parser behind them.
  pdf: { label: "PDF", strategy: "pdf" },
  docx: { label: "DOCX", strategy: "docx" },
  rtf: { label: "RTF", strategy: "rtf" },
  html: { label: "HTML", strategy: "html" },
  htm: { label: "HTML", strategy: "html" },
  xhtml: { label: "HTML", strategy: "html" },
  // Plain text, in every spelling people actually have on disk.
  txt: { label: "TXT", strategy: "text" },
  text: { label: "TXT", strategy: "text" },
  log: { label: "LOG", strategy: "text" },
  md: { label: "MD", strategy: "text" },
  markdown: { label: "MD", strategy: "text" },
  mdx: { label: "MD", strategy: "text" },
  csv: { label: "CSV", strategy: "text" },
  tsv: { label: "TSV", strategy: "text" },
  json: { label: "JSON", strategy: "text" },
  jsonl: { label: "JSON", strategy: "text" },
  ndjson: { label: "JSON", strategy: "text" },
  xml: { label: "XML", strategy: "text" },
  yaml: { label: "YAML", strategy: "text" },
  yml: { label: "YAML", strategy: "text" },
  // Transcript/caption files — the closest thing to a call recording we can read.
  srt: { label: "SRT", strategy: "text" },
  vtt: { label: "VTT", strategy: "text" },
};

/** Every label that may be written to documents.ext by an upload. */
export const EXT_LABELS: readonly ExtLabel[] = Array.from(
  new Set(Object.values(ACCEPTED).map((t) => t.label))
).sort() as ExtLabel[];

/** The `accept` attribute for a file input: every extension in the table. */
export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED)
  .map((ext) => `.${ext}`)
  .join(",");

/** The short human list under a drop zone. */
export const ACCEPTED_SUMMARY =
  "PDF · DOCX · RTF · HTML · TXT · MD · CSV · TSV · JSON · XML · YAML · SRT · VTT · LOG";

/**
 * Formats we are asked for but genuinely cannot read, each with the one
 * sentence that gets the user unstuck. A named refusal beats a generic one:
 * "save it as .docx" is actionable, "unsupported file type" is not.
 */
const KNOWN_REFUSALS: Record<string, string> = {
  doc: "Word's older .doc format can't be read directly. Open it in Word and save it as .docx, then upload that.",
  odt: "OpenDocument text can't be read directly. Export it as .docx or PDF, then upload that.",
  pages: "Apple Pages files can't be read directly. In Pages choose Export To → Word or PDF, then upload that.",
  key: "Keynote files can't be read directly. Export the deck as PDF, then upload that.",
  numbers: "Numbers files can't be read directly. Export the sheet as CSV, then upload that.",
  xlsx: "Spreadsheets can't be read directly. Export the sheet as CSV, then upload that.",
  xls: "Spreadsheets can't be read directly. Export the sheet as CSV, then upload that.",
  pptx: "Slide decks can't be read directly. Export the deck as PDF, then upload that.",
  ppt: "Slide decks can't be read directly. Export the deck as PDF, then upload that.",
  epub: "E-books can't be read directly. Export or print the book to PDF, then upload that.",
  zip: "An archive holds files rather than text. Unzip it and upload the document itself.",
  mp3: "Audio can't be read — there is no text in it to quote. Upload the transcript instead (.txt, .srt or .vtt).",
  m4a: "Audio can't be read — there is no text in it to quote. Upload the transcript instead (.txt, .srt or .vtt).",
  wav: "Audio can't be read — there is no text in it to quote. Upload the transcript instead (.txt, .srt or .vtt).",
  mp4: "Video can't be read — there is no text in it to quote. Upload the transcript instead (.txt, .srt or .vtt).",
  mov: "Video can't be read — there is no text in it to quote. Upload the transcript instead (.txt, .srt or .vtt).",
};

/** "quarterly-notes.PDF" → "pdf"; no dot → "". */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

/** "quarterly-notes.pdf" → "quarterly-notes" (title fallback). */
export function fileNameStem(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
}

/** The accepted type for a filename, or null if the name doesn't name one. */
export function typeFromFileName(fileName: string): AcceptedType | null {
  return ACCEPTED[extensionOf(fileName)] ?? null;
}

/** The specific "we can't read this, do X instead" line, if we have one. */
export function refusalFor(fileName: string): string | null {
  return KNOWN_REFUSALS[extensionOf(fileName)] ?? null;
}

// ---------------------------------------------------------------------------
// Content sniffing — the fallback for a file whose NAME tells us nothing
// (no extension at all, or one we don't recognise). Exported files, email
// attachments and downloads regularly arrive that way, and refusing a perfectly
// readable PDF because it is called "attachment" would be the wrong answer.
// ---------------------------------------------------------------------------

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

/**
 * Is this byte range plausibly UTF-8 text? Decodes the head of the file and
 * fails it if more than 5% of the characters are control bytes or decode
 * errors — the line between "a .txt with odd characters" (keep) and "a JPEG"
 * (refuse).
 */
function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 4096);
  if (head.length === 0) return false;
  const text = new TextDecoder("utf-8").decode(head);
  let bad = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isAllowedControl = code === 9 || code === 10 || code === 13;
    if ((code < 32 && !isAllowedControl) || code === 0xfffd) bad += 1;
  }
  return bad / text.length <= 0.05;
}

/**
 * What the BYTES say this file is, ignoring its name. Returns null when the
 * content is not something we can read.
 */
export function typeFromContent(bytes: Uint8Array): AcceptedType | null {
  // "%PDF"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return { label: "PDF", strategy: "pdf" };
  }
  // "PK\x03\x04" — a zip container; DOCX is the one we can open. mammoth
  // reports honestly if the zip turns out to be something else.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return { label: "DOCX", strategy: "docx" };
  }
  // "{\rtf"
  if (startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66])) {
    return { label: "RTF", strategy: "rtf" };
  }
  if (looksLikeText(bytes)) {
    const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 512)).trimStart();
    if (/^<(!doctype html|html|\?xml[^>]*\?>\s*<html)/i.test(head)) {
      return { label: "HTML", strategy: "html" };
    }
    return { label: "TXT", strategy: "text" };
  }
  return null;
}
