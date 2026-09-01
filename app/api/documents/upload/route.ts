// POST /api/documents/upload — the file half of document ingestion (card-008).
// Accepts one multipart file (every format lib/ingest/file-types.ts can read,
// hard 20 MB cap), extracts its ACTUAL text server-side, inserts the document
// as the signed-in user (server client = user session, RLS enforced — never
// the service key), and writes the UPLOADED audit line. Every failure returns
// JSON with a human `error` message and a truthful status; a non-2xx is never
// an empty body (constitution R3). Every select/insert names its columns (R2).
//
// Two things this route is now deliberately careful about, both from live bugs:
//   * WHAT IT ACCEPTS is a table (lib/ingest/file-types.ts), not a hard-coded
//     list of five extensions, and a file whose NAME says nothing is sniffed
//     by content rather than refused outright (catch #24).
//   * WHAT IT STORES goes through sanitizeDocumentText first. Extracted PDF /
//     DOCX / RTF text routinely carries NULs and lone surrogates that Postgres
//     and JSON cannot hold, and each one turned a perfectly good upload into a
//     500 at the insert (catch #23).
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { PdfEngineError, loadPdfEngine } from "@/lib/ingest/pdf-engine";
import { createClient } from "@/lib/supabase/server";
import { resolveOrgId } from "@/lib/org";
import { internalError } from "@/lib/errors";
import { consumeRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import {
  ACCEPTED_SUMMARY,
  fileNameStem,
  refusalFor,
  typeFromContent,
  typeFromFileName,
  type AcceptedType,
} from "@/lib/ingest/file-types";
import { extractReadableText } from "@/lib/html/readable-text";
import { sanitizeDocumentText, sanitizeLine } from "@/lib/ingest/sanitize";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB, as the sheet promises.

const KINDS = new Set([
  "interview_notes",
  "call_transcript",
  "web_copy",
  "other",
]);

function jsonError(status: number, error: string, headers?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers });
}

// ---------------------------------------------------------------------------
// Text extraction per type
// ---------------------------------------------------------------------------

async function extractPdf(bytes: Uint8Array): Promise<string> {
  // Loaded lazily (lib/ingest/pdf-engine.ts): pdfjs's module evaluation needs
  // DOMMatrix, and importing it statically meant a platform without one
  // crashed EVERY upload at function load — the all-formats empty-body 500.
  const { PDFParse } = await loadPdfEngine();
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

/**
 * Minimal RTF control-word stripper — a DELIBERATE hand-rolled ~40 lines
 * instead of a dependency: the npm RTF parsers are unmaintained
 * callback-era packages, and for "give me the document's plain text" a
 * small transparent pass is easier to trust and to audit. It skips
 * non-text destination groups (font/color tables, stylesheets, embedded
 * pictures…), decodes \'hh hex and \uN unicode escapes, and maps
 * \par|\line → newline and \tab → tab, so the output is the actual
 * document text, not markup.
 */
function extractRtf(rtf: string): string {
  const SKIP_DESTINATIONS = new Set([
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "object",
    "header", "footer", "themedata", "colorschememapping", "listtable",
    "listoverridetable", "latentstyles", "datastore", "generator",
  ]);
  let out = "";
  let skipDepth = 0; // >0 while inside a non-text destination group
  let i = 0;
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === "{") {
      if (skipDepth > 0) skipDepth++;
      i++;
      continue;
    }
    if (ch === "}") {
      if (skipDepth > 0) skipDepth--;
      i++;
      continue;
    }
    if (ch === "\\") {
      const rest = rtf.slice(i + 1);
      const hex = rest.match(/^'([0-9a-fA-F]{2})/);
      if (hex) {
        if (skipDepth === 0) out += String.fromCharCode(parseInt(hex[1], 16));
        i += 4; // backslash + apostrophe + two hex digits
        continue;
      }
      const word = rest.match(/^([a-zA-Z]+)(-?\d+)? ?/);
      if (word) {
        const name = word[1];
        if (name === "u" && word[2] !== undefined) {
          // \uN unicode escape; the character after it is a fallback to skip.
          if (skipDepth === 0) {
            const code = parseInt(word[2], 10);
            out += String.fromCharCode(code < 0 ? code + 65536 : code);
          }
          i += 1 + word[0].length + 1; // backslash + word + fallback char
          continue;
        }
        if (skipDepth === 0) {
          if (name === "par" || name === "line") out += "\n";
          else if (name === "tab") out += "\t";
          else if (SKIP_DESTINATIONS.has(name)) skipDepth = 1;
        }
        i += 1 + word[0].length;
        continue;
      }
      // \*, \{, \}, \\ and other symbol escapes
      const symbol = rest[0];
      if (symbol === "*") {
        // {\* ...} marks an ignorable destination — skip this whole group.
        if (skipDepth === 0) skipDepth = 1;
      } else if (skipDepth === 0 && (symbol === "{" || symbol === "}" || symbol === "\\")) {
        out += symbol;
      } else if (skipDepth === 0 && symbol === "~") {
        out += " ";
      }
      i += 2;
      continue;
    }
    if (skipDepth === 0 && ch !== "\r" && ch !== "\n") out += ch;
    i++;
  }
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** One dispatch point, so adding a format is a row in the table, not an if. */
async function extract(type: AcceptedType, bytes: Uint8Array): Promise<string> {
  if (type.strategy === "pdf") return extractPdf(bytes);
  if (type.strategy === "docx") return extractDocx(bytes);
  if (type.strategy === "rtf") return extractRtf(decodeUtf8(bytes));
  if (type.strategy === "html") return extractReadableText(decodeUtf8(bytes)).text;
  return decodeUtf8(bytes); // every plain-text family member
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonError(401, "You need to be signed in to add documents.");
  }

  // Metered before we spend CPU parsing and extracting a 20 MB file.
  const limit = await consumeRateLimit(supabase, "upload");
  if (!limit.allowed) {
    return jsonError(429, rateLimitMessage("upload", limit.retryAfterSeconds), {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  // The cap, checked BEFORE the body is parsed: formData() itself chokes on
  // very large bodies, which would turn an over-limit file into a misleading
  // "malformed" 400. The declared length catches it first (16 KB of headroom
  // for the multipart framing); file.size below re-checks the real bytes.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BYTES + 16 * 1024) {
    return jsonError(413, "That file is over 20 MB, which is the limit.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "The upload arrived malformed — try the file again.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "No file arrived with the upload. Pick a file and try again.");
  }

  if (file.size > MAX_BYTES) {
    return jsonError(
      413,
      `${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is 20 MB.`
    );
  }

  if (file.size === 0) {
    return jsonError(422, `“${file.name}” is empty, so there is nothing to read.`);
  }

  const kindRaw = form.get("kind");
  const kind =
    typeof kindRaw === "string" && KINDS.has(kindRaw) ? kindRaw : "other";

  const bytes = new Uint8Array(await file.arrayBuffer());

  // What IS this file? The name first, because it is what the user believes.
  // Then, for a name that tells us nothing, the bytes — a download called
  // "attachment" with no extension is still a PDF, and refusing it would be
  // wrong. A format we recognise but genuinely cannot read gets its own named
  // way out ("save it as .docx"), never a generic refusal.
  let type = typeFromFileName(file.name);
  if (type === null) {
    const named = refusalFor(file.name);
    if (named !== null) return jsonError(415, named);
    type = typeFromContent(bytes);
  }
  if (type === null) {
    return jsonError(
      415,
      `We couldn't read “${file.name}” as text. We can read ${ACCEPTED_SUMMARY}.`
    );
  }

  let extracted: string;
  try {
    extracted = await extract(type, bytes);
  } catch (cause) {
    // Server log keeps the real parser error for operators; the client gets
    // the human version. An engine that failed to LOAD is our fault, never
    // the file's — saying "corrupted" there would blame the user for a
    // deployment problem.
    console.error(`extraction failed for ${file.name} (${type.label}):`, cause);
    if (cause instanceof PdfEngineError) {
      return jsonError(
        500,
        internalError(
          "Reading PDFs is unavailable right now — the file is fine, and nothing was added. Try again shortly.",
          "upload pdf engine load failed",
          cause
        )
      );
    }
    return jsonError(
      422,
      `We couldn't read “${file.name}” as a ${type.label} file. It may be corrupted or password-protected.`
    );
  }

  // The gate that stops a good upload dying as a 500: NULs, lone surrogates
  // and stray control characters cannot survive a Postgres text column or the
  // JSON that carries it, and PDF/DOCX/RTF extraction emits all three.
  const body = sanitizeDocumentText(extracted).trim();
  if (body === "") {
    return jsonError(
      422,
      `We couldn't find any readable text in “${file.name}”. A scanned or image-only file has nothing a briefing can quote.`
    );
  }

  const titleRaw = form.get("title");
  const givenTitle = typeof titleRaw === "string" ? sanitizeLine(titleRaw) : "";
  const fileName = sanitizeLine(file.name);
  const title =
    givenTitle !== ""
      ? givenTitle
      : sanitizeLine(fileNameStem(file.name)) || fileName || "Untitled document";

  // The user's org — one shared, deterministically-ordered lookup (lib/org.ts).
  const org = await resolveOrgId(supabase, user.id);
  if (org.error) {
    return jsonError(org.error.status, org.error.message);
  }
  const orgId = org.orgId;

  // RLS (documents_insert) re-checks this org server-side; the insert runs
  // as the signed-in user, never the service role.
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      title,
      kind,
      body,
      file_name: fileName || title,
      ext: type.label,
      size_bytes: file.size,
      added_by: user.id,
    })
    .select("id, title, kind, ext, file_name, size_bytes, created_at, added_by")
    .single();
  if (insertError || !doc) {
    return jsonError(
      500,
      internalError(
        "Saving the document failed, so nothing was added. Try again.",
        "upload document insert failed",
        insertError ?? new Error("no row came back")
      )
    );
  }

  // The UPLOADED audit line. `actor` is stamped from the verified JWT by the
  // audit_events_stamp_actor trigger (migration 0003) — what we send is a
  // hint, not the authority.
  const actor = (user.email ?? "user").split("@")[0].toUpperCase();
  const kb = Math.max(1, Math.round(file.size / 1024));
  const { error: auditError } = await supabase.from("audit_events").insert({
    org_id: orgId,
    document_id: doc.id,
    event: "UPLOADED",
    detail: `${fileName || title} · ${kb} KB`,
    actor,
    actor_user_id: user.id,
  });

  // The document IS saved at this point, so a failed audit line is reported
  // as a warning on a 200 — claiming total failure would be the real lie.
  return NextResponse.json({
    document: doc,
    warning: auditError
      ? internalError(
          "The document was added, but writing its history line failed.",
          "upload audit insert failed",
          auditError
        )
      : null,
  });
}
