// POST /api/documents/upload — the file half of document ingestion (card-008).
// Accepts one multipart file (PDF/DOCX/TXT/MD/RTF, hard 20 MB cap), extracts
// its ACTUAL text server-side, inserts the document as the signed-in user
// (server client = user session, RLS enforced — never the service key), and
// writes the UPLOADED audit line. Every failure returns JSON with a human
// `error` message and a truthful status; a non-2xx is never an empty body
// (constitution R3). Every select/insert names its columns (R2).
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
// pdf.js resolves its worker with a runtime dynamic import that a bundled
// server route cannot satisfy ("Cannot find module …/pdf.worker.mjs"). The
// documented escape hatch is the main-thread global: when
// globalThis.pdfjsWorker is set, pdf.js uses it and never dynamic-imports
// (see PDFWorker._setupFakeWorkerGlobal in pdfjs-dist). Importing the worker
// statically lets the bundler carry it; same pinned version as pdf-parse's
// own pdfjs, so the api/worker version check always matches.
// @ts-expect-error -- pdf.worker.mjs ships no type declarations
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { createClient } from "@/lib/supabase/server";

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB, as the sheet promises.

const KINDS = new Set([
  "interview_notes",
  "call_transcript",
  "web_copy",
  "other",
]);

type ParsedExt = "PDF" | "DOCX" | "TXT" | "MD" | "RTF";

function extFromName(name: string): ParsedExt | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toUpperCase();
  if (ext === "PDF" || ext === "DOCX" || ext === "TXT" || ext === "MD" || ext === "RTF") {
    return ext;
  }
  return null;
}

/** "quarterly-notes.pdf" → "quarterly-notes" (title fallback). */
function fileNameStem(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

// ---------------------------------------------------------------------------
// Text extraction per type
// ---------------------------------------------------------------------------

async function extractPdf(bytes: Uint8Array): Promise<string> {
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

  const ext = extFromName(file.name);
  if (ext === null) {
    return jsonError(
      415,
      `We can read PDF, DOCX, TXT, MD and RTF files — “${file.name}” isn't one of those.`
    );
  }

  const kindRaw = form.get("kind");
  const kind =
    typeof kindRaw === "string" && KINDS.has(kindRaw) ? kindRaw : "other";

  const bytes = new Uint8Array(await file.arrayBuffer());

  let body: string;
  try {
    if (ext === "PDF") body = await extractPdf(bytes);
    else if (ext === "DOCX") body = await extractDocx(bytes);
    else if (ext === "RTF") body = extractRtf(decodeUtf8(bytes));
    else body = decodeUtf8(bytes); // TXT / MD are already plain text
  } catch (cause) {
    // Server log keeps the real parser error for operators; the client gets
    // the human version.
    console.error(`extraction failed for ${file.name} (${ext}):`, cause);
    return jsonError(
      422,
      `We couldn't read “${file.name}” as a ${ext} file. It may be corrupted or password-protected.`
    );
  }

  body = body.replace(/\r\n/g, "\n").trim();
  if (body === "") {
    return jsonError(
      422,
      `We couldn't find any readable text in “${file.name}”. A scanned or image-only file has nothing a briefing can quote.`
    );
  }

  const titleRaw = form.get("title");
  const title =
    typeof titleRaw === "string" && titleRaw.trim() !== ""
      ? titleRaw.trim()
      : fileNameStem(file.name) || file.name;

  // The user's org — named column, scoped to their own membership row.
  const { data: memberships, error: orgError } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1);
  if (orgError) {
    return jsonError(500, `We couldn't look up your organization: ${orgError.message}`);
  }
  if (!memberships || memberships.length === 0) {
    return jsonError(403, "Your account isn't in an organization yet, so there is nowhere to put this document.");
  }
  const orgId = memberships[0].org_id as string;

  // RLS (documents_insert) re-checks this org server-side; the insert runs
  // as the signed-in user, never the service role.
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      title,
      kind,
      body,
      file_name: file.name,
      ext,
      size_bytes: file.size,
      added_by: user.id,
    })
    .select("id, title, kind, ext, file_name, size_bytes, created_at, added_by")
    .single();
  if (insertError || !doc) {
    return jsonError(
      500,
      `Saving the document failed: ${insertError?.message ?? "no row came back"}. Nothing was added.`
    );
  }

  // The UPLOADED audit line (append-only trail; actor label derived from the
  // VERIFIED email, never from client input).
  const actor = (user.email ?? "user").split("@")[0].toUpperCase();
  const kb = Math.max(1, Math.round(file.size / 1024));
  const { error: auditError } = await supabase.from("audit_events").insert({
    org_id: orgId,
    document_id: doc.id,
    event: "UPLOADED",
    detail: `${file.name} · ${kb} KB`,
    actor,
    actor_user_id: user.id,
  });

  // The document IS saved at this point, so a failed audit line is reported
  // as a warning on a 200 — claiming total failure would be the real lie.
  return NextResponse.json({
    document: doc,
    warning: auditError
      ? `The document was added, but writing its history line failed: ${auditError.message}`
      : null,
  });
}
