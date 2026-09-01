// POST /api/documents/fetch-url — the web half of document ingestion
// (card-008). Body: { url, title?, kind? }. Validates http(s), fetches the
// page with a 10 s timeout and a 5 MB cap, strips it down to readable text,
// and inserts the document as the signed-in user (server client = user
// session, RLS enforced — never the service key) plus its UPLOADED audit
// line. Every failure is JSON with a human `error` and a truthful status;
// non-2xx is never an empty body (R3). Every select/insert names its
// columns (R2).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 5 * 1024 * 1024; // 5 MB page cap

const KINDS = new Set([
  "interview_notes",
  "call_transcript",
  "web_copy",
  "other",
]);

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

// ---------------------------------------------------------------------------
// Readable-text extraction: strip scripts/styles/tags, decode the common
// entities, collapse whitespace. Small on purpose — enough to turn an
// article page into quotable text without pulling in a DOM.
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&([a-zA-Z]+);/g, (match, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? match
    );
}

function extractReadableText(html: string): {
  text: string;
  pageTitle: string | null;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch
    ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() || null
    : null;

  const text = decodeEntities(
    html
      // Whole elements whose content is never prose:
      .replace(
        /<(script|style|noscript|template|svg|head|iframe|object)\b[\s\S]*?<\/\1\s*>/gi,
        " "
      )
      .replace(/<!--[\s\S]*?-->/g, " ")
      // Block-level boundaries become line breaks so paragraphs survive…
      .replace(
        /<\/?(p|div|section|article|li|ul|ol|table|tr|blockquote|h[1-6]|br|hr|figure|figcaption|header|footer|main|aside|nav|dd|dt|pre)\b[^>]*>/gi,
        "\n"
      )
      // …then every remaining tag disappears.
      .replace(/<[^>]+>/g, " ")
  )
    // Collapse: spaces within lines, then runs of blank lines.
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  return { text, pageTitle };
}

/**
 * Blocks addresses that point inside a private network (SSRF, catch #16).
 * Rejects localhost, the cloud metadata IP, and literal RFC-1918 / link-local
 * / unique-local / loopback addresses. A hostname that resolves to a private
 * IP only at connect time (DNS rebinding) is out of scope on Vercel's
 * serverless network and noted on the ASSUMED list.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  if (h === "169.254.169.254") return true; // cloud instance metadata
  // IPv4 literals
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  }
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  return false;
}

/** "https://example.com/reports/q3/" → "example.com/reports/q3" (≤80 chars). */
function fileNameFromUrl(url: URL): string {
  const path = url.pathname.replace(/\/+$/, "");
  const name = `${url.host}${path}`;
  return name.length > 80 ? `${name.slice(0, 79)}…` : name;
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

  let payload: { url?: unknown; title?: unknown; kind?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "The request arrived malformed — try again.");
  }

  if (typeof payload.url !== "string" || payload.url.trim() === "") {
    return jsonError(400, "Paste a web address to fetch.");
  }

  let url: URL;
  try {
    url = new URL(payload.url.trim());
  } catch {
    return jsonError(400, `“${payload.url.trim()}” isn't a valid web address.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return jsonError(400, "Only http(s) pages can be fetched.");
  }
  if (isBlockedHost(url.hostname)) {
    return jsonError(400, "That address points inside a private network and can't be fetched.");
  }

  // Fetch with a 10 s timeout; the cap is enforced while reading, so a huge
  // page stops costing us bytes the moment it crosses 5 MB. redirect:"manual"
  // so a public URL can't 30x-redirect us into a private one (SSRF, catch #16):
  // each hop's Location is re-validated through isBlockedHost.
  let response: Response;
  let current = url;
  try {
    let hops = 0;
    for (;;) {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": "SignalNotes/1.0 (+document ingestion)" },
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      if (++hops > 4) {
        return jsonError(502, `${url.host} redirected too many times.`);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return jsonError(502, `${url.host} sent an invalid redirect.`);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return jsonError(400, "That page redirects to a non-web address.");
      }
      if (isBlockedHost(next.hostname)) {
        return jsonError(400, "That page redirects into a private network and can't be fetched.");
      }
      current = next;
    }
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      return jsonError(
        504,
        `${url.host} didn't answer within 10 seconds. Try again, or paste the text instead.`
      );
    }
    return jsonError(502, `We couldn't reach ${url.host}. Check the address and try again.`);
  }

  if (!response.ok) {
    return jsonError(
      502,
      `${url.host} answered with ${response.status}, so there is no page to read.`
    );
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const isTextual =
    contentType === "" ||
    contentType.includes("html") ||
    contentType.includes("xml") ||
    contentType.startsWith("text/");
  if (!isTextual) {
    return jsonError(
      415,
      `That link answers with “${contentType.split(";")[0]}”, not a readable web page. To add a file, upload it instead.`
    );
  }

  let html = "";
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      return jsonError(502, `${url.host} sent an empty response.`);
    }
    const decoder = new TextDecoder("utf-8");
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_PAGE_BYTES) {
        await reader.cancel();
        return jsonError(413, "That page is larger than 5 MB — too big to ingest.");
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
  } catch {
    return jsonError(502, `The connection to ${url.host} dropped mid-page. Try again.`);
  }

  const { text, pageTitle } = extractReadableText(html);
  if (text === "") {
    return jsonError(
      422,
      "That page had no readable text once the markup was stripped. Paste the text instead."
    );
  }

  const fileName = fileNameFromUrl(url);
  const titleRaw = payload.title;
  const title =
    typeof titleRaw === "string" && titleRaw.trim() !== ""
      ? titleRaw.trim()
      : (pageTitle ?? fileName);
  const kind =
    typeof payload.kind === "string" && KINDS.has(payload.kind)
      ? payload.kind
      : "web_copy";
  const sizeBytes = Buffer.byteLength(text, "utf8");

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

  // RLS (documents_insert) re-checks the org; runs as the signed-in user.
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      title,
      kind,
      body: text,
      file_name: fileName,
      ext: "WEB",
      size_bytes: sizeBytes,
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

  const actor = (user.email ?? "user").split("@")[0].toUpperCase();
  const kb = Math.max(1, Math.round(sizeBytes / 1024));
  const { error: auditError } = await supabase.from("audit_events").insert({
    org_id: orgId,
    document_id: doc.id,
    event: "UPLOADED",
    detail: `${fileName} · ${kb} KB`,
    actor,
    actor_user_id: user.id,
  });

  return NextResponse.json({
    document: doc,
    warning: auditError
      ? `The document was added, but writing its history line failed: ${auditError.message}`
      : null,
  });
}
