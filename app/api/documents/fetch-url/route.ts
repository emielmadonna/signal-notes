// POST /api/documents/fetch-url — the web half of document ingestion
// (card-008). Body: { url, title?, kind? }. Validates http(s), refuses
// private-network targets, fetches the page with a 10 s timeout and a 5 MB
// cap, strips it down to readable text, and inserts the document as the
// signed-in user (server client = user session, RLS enforced — never the
// service key) plus its UPLOADED audit line. Every failure is JSON with a
// human `error` and a truthful status; non-2xx is never an empty body (R3).
// Every select/insert names its columns (R2).
//
// Audit follow-ups now landed here:
//   - The SSRF host check moved to lib/net/private-address.ts and grew real
//     IPv6 handling (an IPv4-mapped literal used to walk through) while
//     losing its habit of rejecting every domain starting "fc"/"fd".
//   - HTML extraction moved to lib/html/readable-text.ts, where a hostile
//     numeric entity can no longer crash the handler into an empty 500.
//   - This route is an authenticated OUTBOUND FETCHER, so it is metered.
//   - Driver error text is logged, not returned (lib/errors.ts).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBlockedHost } from "@/lib/net/private-address";
import { extractReadableText } from "@/lib/html/readable-text";
import { sanitizeDocumentText, sanitizeLine } from "@/lib/ingest/sanitize";
import { resolveOrgId } from "@/lib/org";
import { internalError, logInternal } from "@/lib/errors";
import { consumeRateLimit, rateLimitMessage } from "@/lib/rate-limit";

export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 5 * 1024 * 1024; // 5 MB page cap
const MAX_REDIRECTS = 4;

const KINDS = new Set([
  "interview_notes",
  "call_transcript",
  "web_copy",
  "other",
]);

function jsonError(status: number, error: string, headers?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers });
}

/** "https://example.com/reports/q3/" → "example.com/reports/q3" (≤80 chars). */
function fileNameFromUrl(url: URL): string {
  const path = url.pathname.replace(/\/+$/, "");
  const name = `${url.host}${path}`;
  return name.length > 80 ? `${name.slice(0, 79)}…` : name;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonError(401, "You need to be signed in to add documents.");
  }

  // Metered BEFORE we make any outbound request on the caller's behalf.
  const limit = await consumeRateLimit(supabase, "fetch-url");
  if (!limit.allowed) {
    return jsonError(429, rateLimitMessage("fetch-url", limit.retryAfterSeconds), {
      "Retry-After": String(limit.retryAfterSeconds),
    });
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
      if (++hops > MAX_REDIRECTS) {
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
    logInternal(`fetch-url could not reach ${url.host}`, cause);
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
  } catch (cause) {
    logInternal(`fetch-url stream dropped for ${url.host}`, cause);
    return jsonError(502, `The connection to ${url.host} dropped mid-page. Try again.`);
  }

  // Belt and braces: extraction is now hardened against hostile entities, but
  // it still runs on wholly attacker-supplied bytes, so a surprise here must
  // be a truthful 422 rather than an empty 500 (R3).
  let text: string;
  let pageTitle: string | null;
  try {
    ({ text, pageTitle } = extractReadableText(html));
  } catch (cause) {
    return jsonError(
      422,
      internalError(
        `We couldn't read the page at ${url.host}. Paste the text instead.`,
        `fetch-url extraction failed for ${url.host}`,
        cause
      )
    );
  }

  // The same gate the upload route uses: a page can carry NULs and lone
  // surrogates (numeric entities decode straight into them), and Postgres
  // rejects both — which arrives as a 500 at the insert, not here (catch #23).
  text = sanitizeDocumentText(text).trim();
  if (text === "") {
    return jsonError(
      422,
      "That page had no readable text once the markup was stripped. Paste the text instead."
    );
  }

  const fileName = fileNameFromUrl(url);
  const titleRaw = payload.title;
  const title = sanitizeLine(
    typeof titleRaw === "string" && titleRaw.trim() !== ""
      ? titleRaw
      : (pageTitle ?? fileName)
  ) || fileName;
  const kind =
    typeof payload.kind === "string" && KINDS.has(payload.kind)
      ? payload.kind
      : "web_copy";
  const sizeBytes = Buffer.byteLength(text, "utf8");

  // The user's org — one shared, deterministically-ordered lookup (lib/org.ts).
  const org = await resolveOrgId(supabase, user.id);
  if (org.error) {
    return jsonError(org.error.status, org.error.message);
  }
  const orgId = org.orgId;

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
      internalError(
        "Saving the document failed, so nothing was added. Try again.",
        "fetch-url document insert failed",
        insertError ?? new Error("no row came back")
      )
    );
  }

  // The UPLOADED audit line. `actor` is stamped from the verified JWT by the
  // audit_events_stamp_actor trigger (migration 0003) — what we send is a
  // hint, not the authority.
  const kb = Math.max(1, Math.round(sizeBytes / 1024));
  const { error: auditError } = await supabase.from("audit_events").insert({
    org_id: orgId,
    document_id: doc.id,
    event: "UPLOADED",
    detail: `${fileName} · ${kb} KB`,
    actor: (user.email ?? "user").split("@")[0].toUpperCase(),
    actor_user_id: user.id,
  });

  // The document IS saved at this point, so a failed audit line is reported as
  // a warning on a 200 — claiming total failure would be the real lie.
  return NextResponse.json({
    document: doc,
    warning: auditError
      ? internalError(
          "The document was added, but writing its history line failed.",
          "fetch-url audit insert failed",
          auditError
        )
      : null,
  });
}
