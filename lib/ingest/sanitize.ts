// lib/ingest/sanitize.ts — make extracted text safe to STORE.
//
// This exists because of a real, reproduced 500 (catch #23): PDF, DOCX and RTF
// extraction routinely emits two characters Postgres/PostgREST cannot carry,
// and both surfaced as `500 Saving the document failed` on upload:
//
//   1. U+0000 (NUL). A Postgres `text` value physically cannot contain it;
//      PostgREST answers "unsupported Unicode escape sequence". CID-mapped PDF
//      fonts produce NULs whenever a glyph has no Unicode mapping.
//   2. LONE SURROGATES (an unpaired U+D800-U+DFFF). JSON.stringify turns them
//      into invalid escapes, so the insert body never even parses - PostgREST
//      answers "Empty or invalid json". RTF's \uN escape and pdf.js's UTF-16
//      surrogate handling both emit these.
//
// Neither is readable text, so dropping them loses nothing a briefing could
// quote - but leaving them in loses the whole document. The pass also strips
// the remaining C0 control characters (keeping tab and newline), which are
// likewise never prose.
//
// Used by BOTH ingestion routes and the paste path, so every write to
// documents.body goes through the same gate.

/**
 * C0 controls + DEL, minus the two that ARE text: tab (09) and newline (0A).
 * Written as \u escapes rather than literal bytes so the source stays readable
 * and survives copy/paste intact.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * An unpaired surrogate: a high one not followed by a low, or a stray low.
 *
 * Written WITHOUT lookbehind on purpose. The obvious spelling of the second
 * half is `(?<!high)[low]`, but this module is imported by
 * components/add-document/add-document-sheet.tsx — a CLIENT component — so
 * this regex literal is parsed by the browser. Lookbehind only reached Safari
 * in 16.4 (March 2023); anywhere older the literal is a SyntaxError at module
 * PARSE time, which takes down the whole chunk rather than merely degrading
 * sanitisation.
 *
 * Instead: match a WELL-FORMED PAIR first — regex alternation is ordered, so a
 * valid pair always wins — and capture a lone surrogate only in the second
 * branch. The replacer keeps the match when nothing was captured.
 */
const LONE_SURROGATE =
  /[\uD800-\uDBFF][\uDC00-\uDFFF]|([\uD800-\uDBFF]|[\uDC00-\uDFFF])/g;

/** Keeps well-formed pairs; replaces only what the capture group matched. */
function replaceLoneSurrogates(text: string): string {
  return text.replace(LONE_SURROGATE, (match, lone: string | undefined) =>
    lone === undefined ? match : REPLACEMENT
  );
}

/** U+FFFD REPLACEMENT CHARACTER — what an unreadable code unit becomes. */
const REPLACEMENT = "�";

/**
 * Strip everything a Postgres `text` column (and the JSON that carries it)
 * cannot hold, then normalize line endings. Returns text safe to insert.
 *
 * Deliberately NOT a trim: callers decide whether an empty result is an error.
 */
export function sanitizeDocumentText(raw: string): string {
  return replaceLoneSurrogates(raw.replace(/\r\n?/g, "\n")).replace(
    CONTROL_CHARS,
    ""
  );
}

/**
 * The same gate for one-line values (titles, file names): control characters
 * and lone surrogates out, whitespace collapsed to single spaces.
 */
export function sanitizeLine(raw: string): string {
  return replaceLoneSurrogates(raw)
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}
