// =============================================================================
// lib/ai/generation.ts — the generation orchestration (card-010).
//
// SERVER ONLY. Owns the database side of a run: it prepares the briefing row +
// its bound sources + the opening audit lines, then drives the model loop
// (lib/ai/anthropic.ts) while PERSISTING every activity-log line as a
// generation_events row AS IT HAPPENS — so a run survives the client closing
// (rule 8 + the "you can close this, the run keeps going" promise): the DB is
// the source of truth, and the events route replays it.
//
// Every Supabase write's { error } is checked (rule 3). A persistence failure
// mid-run fails the run honestly rather than pretending it streamed. All DB
// access is through the caller's user-session client (RLS org-scoping holds);
// the service-role key is never used here.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  streamBriefing,
  NoBriefingSubmittedError,
  type BoundDocument,
  type BriefingHandlers,
} from "./anthropic";
import { BRIEFING_PROMPT_VERSION } from "@/lib/prompts/briefing";
import Anthropic from "@anthropic-ai/sdk";
import { resolveOrgId } from "@/lib/org";
import { internalError, logInternal } from "@/lib/errors";
import {
  resolveModel,
  type AllowedModel,
  type BriefingSections,
  type GenerationEventKind,
  type GenerateRequest,
  type StreamMessage,
} from "@/lib/briefing-types";

// ---------------------------------------------------------------------------
// Caps. A generation is the most expensive thing a signed-in user can ask for,
// so the size of the request is bounded here as well as metered by the route.
// ---------------------------------------------------------------------------

/**
 * How many documents one briefing may be grounded in. Previously unbounded:
 * a client could post every document id in the workspace and the engine would
 * bind them all. Twelve is well past the product's own framing (the composer
 * is built for a handful of sources) and still leaves the model's context
 * intact once each source is capped by MAX_DOCUMENT_CHARS in lib/ai/anthropic.
 */
export const MAX_SOURCE_DOCUMENTS = 12;

// ---------------------------------------------------------------------------
// Batched persistence of the activity log.
//
// Every activity-log line is still persisted BEFORE it is forwarded to the
// client — that is what lets a run outlive the browser. What changed is the
// granularity: emit() used to await one INSERT per ~180-character chunk, so a
// 6000-word briefing spent 200 serial round-trips (10-15 s of pure database
// latency) inside the user-visible stream. Lines are now buffered for a few
// milliseconds and written as ONE multi-row insert, which keeps the ordering
// and the persist-then-forward guarantee while cutting the round-trips by an
// order of magnitude.
// ---------------------------------------------------------------------------

/** Flush once this many lines are waiting… */
const EVENT_BATCH_MAX = 24;
/** …or this long after the first one arrives, whichever comes first. */
const EVENT_BATCH_MS = 120;

// ---------------------------------------------------------------------------
// Errors distinguishable in the failure path.
// ---------------------------------------------------------------------------

class PersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistError";
  }
}

// A prepare step failed the caller should turn into an HTTP status.
export type PrepareFailure = { status: number; error: string };

export type PreparedGeneration = {
  briefingId: string;
  orgId: string;
  model: AllowedModel;
  requestedTitle: string | null;
  documents: BoundDocument[];
  userId: string;
  userLabel: string;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

/** Collapse all whitespace to single spaces so quotes match across the
 *  newline noise that PDF/DOCX extraction introduces. */
function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function actorLabelFromEmail(email: string | null | undefined): string {
  return (email ?? "user").split("@")[0].toUpperCase();
}

// ---------------------------------------------------------------------------
// PREPARE — validate the request, bind the sources, create the rows.
// Returns either the prepared context or a PrepareFailure (never both).
// ---------------------------------------------------------------------------

export async function prepareGeneration(
  supabase: SupabaseClient,
  user: { id: string; email: string | null | undefined },
  req: GenerateRequest
): Promise<{ prepared: PreparedGeneration } | { failure: PrepareFailure }> {
  // Model: validated against the allowlist server-side; the client string is
  // never trusted past this gate (DESIGN-SPEC §5 D1).
  const model = resolveModel(req.model);
  if (model === null) {
    return {
      failure: {
        status: 400,
        error: `“${String(req.model)}” isn't a model you can generate with.`,
      },
    };
  }

  // Document ids: at least one, all strings, de-duplicated.
  if (!Array.isArray(req.documentIds)) {
    return { failure: { status: 400, error: "No documents were selected." } };
  }
  const ids = Array.from(
    new Set(req.documentIds.filter((v): v is string => typeof v === "string"))
  );
  if (ids.length === 0) {
    return {
      failure: {
        status: 400,
        error:
          "Select at least one document — a briefing with no sources would just be a guess.",
      },
    };
  }
  if (ids.length > MAX_SOURCE_DOCUMENTS) {
    return {
      failure: {
        status: 400,
        error: `A briefing can be grounded in at most ${MAX_SOURCE_DOCUMENTS} documents; you selected ${ids.length}. Narrow the selection and try again.`,
      },
    };
  }

  const requestedTitle =
    typeof req.title === "string" && req.title.trim() !== ""
      ? req.title.trim()
      : null;

  // The user's org — one shared, deterministically-ordered lookup (lib/org.ts).
  const org = await resolveOrgId(supabase, user.id);
  if (org.error) {
    return { failure: { status: org.error.status, error: org.error.message } };
  }
  const orgId = org.orgId;

  // Load the selected documents (named columns, R2). RLS scopes rows to the
  // caller's org, so a cross-org id simply returns nothing — which we treat as
  // "not found" (400), never a leak and never a silent drop.
  const { data: docRows, error: docError } = await supabase
    .from("documents")
    .select("id, title, kind, ext, body")
    .in("id", ids);
  if (docError) {
    return {
      failure: {
        status: 500,
        error: internalError(
          "We couldn't load the selected documents.",
          "generation: loading source documents failed",
          docError
        ),
      },
    };
  }
  const documents = (docRows ?? []) as BoundDocument[];
  if (documents.length !== ids.length) {
    const found = new Set(documents.map((d) => d.id));
    const missing = ids.filter((id) => !found.has(id));
    return {
      failure: {
        status: 400,
        error: `${missing.length} selected document(s) aren't in your workspace, so the briefing can't be grounded. Reload and try again.`,
      },
    };
  }
  // Guard against an all-empty source set — nothing to ground in.
  if (documents.every((d) => (d.body ?? "").trim() === "")) {
    return {
      failure: {
        status: 400,
        error: "The selected documents have no readable text to ground a briefing in.",
      },
    };
  }

  // Create the briefing row (status generating). RLS re-checks the org.
  const { data: briefingRow, error: briefingError } = await supabase
    .from("briefings")
    .insert({
      org_id: orgId,
      title: requestedTitle,
      status: "generating",
      model,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (briefingError || !briefingRow) {
    return {
      failure: {
        status: 500,
        error: internalError(
          "Starting the briefing failed, so nothing was created.",
          "generation: briefing insert failed",
          briefingError ?? new Error("no row came back")
        ),
      },
    };
  }
  const briefingId = briefingRow.id as string;

  // Bind the sources (composite-FK safe: same org as the briefing + docs).
  const { error: sourcesError } = await supabase.from("briefing_sources").insert(
    documents.map((d) => ({
      briefing_id: briefingId,
      document_id: d.id,
      org_id: orgId,
    }))
  );
  if (sourcesError) {
    // Roll the half-made briefing back so no orphan GENERATING card lingers.
    // If the rollback ITSELF fails, say so honestly — don't claim a cleanup
    // that didn't happen (rule 3: the write's error is checked and surfaced).
    const { data: rolledBack, error: rollbackError } = await supabase
      .from("briefings")
      .delete()
      .eq("id", briefingId)
      .select("id");
    const rolledBackOk = !rollbackError && (rolledBack?.length ?? 0) === 1;
    const reference = logInternal(
      "generation: binding source documents failed",
      { sourcesError, rollbackError }
    );
    return {
      failure: {
        status: 500,
        error: rolledBackOk
          ? `Binding the source documents failed. The briefing was rolled back. (reference ${reference})`
          : `Binding the source documents failed, and the empty briefing could NOT be rolled back — it may still appear, so delete it and try again. (reference ${reference})`,
      },
    };
  }

  const userLabel = actorLabelFromEmail(user.email);

  // Opening audit lines: RUN STARTED, then one SOURCE BOUND per document.
  // Audit failures are surfaced (not swallowed) but do not abort a valid run —
  // the generation matters more than its trail line; the miss is logged.
  const { error: runAuditError } = await supabase.from("audit_events").insert({
    org_id: orgId,
    briefing_id: briefingId,
    event: "RUN STARTED",
    detail: `${model} · ${documents.length} source${documents.length === 1 ? "" : "s"} · prompt ${BRIEFING_PROMPT_VERSION}`,
    actor: userLabel,
    actor_user_id: user.id,
  });
  if (runAuditError) {
    logInternal("generation: RUN STARTED audit line failed", runAuditError);
  }
  const { error: boundAuditError } = await supabase.from("audit_events").insert(
    documents.map((d) => ({
      org_id: orgId,
      briefing_id: briefingId,
      document_id: d.id,
      event: "SOURCE BOUND",
      detail: d.title,
      actor: userLabel,
      actor_user_id: user.id,
    }))
  );
  if (boundAuditError) {
    logInternal("generation: SOURCE BOUND audit lines failed", boundAuditError);
  }

  return {
    prepared: {
      briefingId,
      orgId,
      model,
      requestedTitle,
      documents,
      userId: user.id,
      userLabel,
    },
  };
}

// ---------------------------------------------------------------------------
// Citation verification: keep only citations whose quote is a genuine passage
// of the document it names (rule 6 — the tooltips must be real). Returns the
// cleaned sections and the verified/total counts.
// ---------------------------------------------------------------------------

function verifyCitations(
  raw: BriefingSections,
  docMap: Map<string, BoundDocument>
): { sections: BriefingSections; verified: number; total: number } {
  let verified = 0;
  let total = 0;
  const sections = raw.sections.map((section) => {
    const citations = section.citations.filter((c) => {
      total += 1;
      const doc = docMap.get(c.document_id);
      if (!doc) return false;
      const ok = normalizeForMatch(doc.body).includes(normalizeForMatch(c.quote));
      if (ok) verified += 1;
      return ok;
    });
    // Fill a missing label with the document's real title.
    const labeled = citations.map((c) => ({
      ...c,
      label: c.label.trim() !== "" ? c.label : (docMap.get(c.document_id)?.title ?? c.label),
    }));
    return { ...section, citations: labeled };
  });
  return { sections: { lede: raw.lede, sections }, verified, total };
}

/** Fallback body when the model submitted structure but streamed no prose. */
function renderBodyFromSections(title: string, s: BriefingSections): string {
  const parts: string[] = [`# ${title}`, ""];
  if (s.lede.trim() !== "") parts.push(s.lede.trim(), "");
  for (const section of s.sections) {
    parts.push(`## ${section.head}`, "");
    for (const p of section.paragraphs) parts.push(p, "");
  }
  return parts.join("\n").trim();
}

/**
 * The sentence the reader sees when a run dies. Each branch says what class of
 * thing went wrong and what to do about it — but the driver's own words are
 * logged, not echoed. The catch-all used to interpolate `cause.message`
 * directly, which shipped Postgres constraint and policy names to the browser
 * on any unanticipated failure.
 */
function humanFailure(cause: unknown): string {
  if (cause instanceof NoBriefingSubmittedError) {
    return "the analysis didn't produce a finished briefing. Try again.";
  }
  if (cause instanceof PersistError) {
    // PersistError messages are composed by us and already reference-only.
    return `a database write failed mid-run (${cause.message}). Try again.`;
  }
  if (cause instanceof Anthropic.APIError) {
    // The status alone is not diagnosable — a 400 from the model service can
    // be a malformed message array, a context overflow, or a bad parameter,
    // and they need completely different fixes. The operator gets the whole
    // error; the reader still gets only the status and a reference.
    const reference = logInternal(
      `generation: model service ${cause.status ?? "network"} error`,
      cause
    );
    return `the model service returned an error (${cause.status ?? "network"}, reference ${reference}). Try again.`;
  }
  const reference = logInternal("generation: unexpected run failure", cause);
  return `an unexpected error stopped the run (reference ${reference}). Try again.`;
}

// ---------------------------------------------------------------------------
// RUN — drive the model, persist every event, finalize the briefing.
// `sink` forwards events live to an SSE client; pass null for a headless run
// (a test harness, or a client that has already gone away). Persistence
// happens regardless of the sink, which is what lets the run outlive the
// client.
// ---------------------------------------------------------------------------

export type SseSink = (message: StreamMessage) => void;

export type RunOutcome = {
  status: "complete" | "failed";
  wordCount: number | null;
  citationCount: number | null;
  error: string | null;
};

export async function runGeneration(
  supabase: SupabaseClient,
  prepared: PreparedGeneration,
  sink: SseSink | null
): Promise<RunOutcome> {
  const { briefingId, orgId, model, documents, requestedTitle } = prepared;
  const docMap = new Map(documents.map((d) => [d.id, d]));

  let partialText = "";
  let clientGone = false;

  // ---- the batching writer -------------------------------------------------
  // Lines are buffered briefly and written as one multi-row insert, then
  // forwarded in the same order. Persist-then-forward is unchanged; only the
  // number of round-trips is. A failed flush is remembered and re-thrown from
  // the next emit() or from drain(), so the run still fails honestly.
  type PendingEvent = { kind: GenerationEventKind; content: string };
  let buffer: PendingEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushChain: Promise<void> = Promise.resolve();
  let persistFailure: PersistError | null = null;

  const forward = (
    kind: GenerationEventKind,
    content: string,
    id: number,
    at: string
  ) => {
    if (sink === null || clientGone) return;
    try {
      sink({ type: "event", id, kind, content, at });
    } catch {
      clientGone = true; // client disconnected; keep persisting to the DB
    }
  };

  const flush = async (): Promise<void> => {
    if (persistFailure !== null || buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    const { data, error } = await supabase
      .from("generation_events")
      .insert(
        batch.map((e) => ({
          briefing_id: briefingId,
          org_id: orgId,
          kind: e.kind,
          content: e.content,
        }))
      )
      .select("id, created_at"); // named columns (R2)
    const rows = (data ?? []) as { id: number; created_at: string }[];
    if (error || rows.length !== batch.length) {
      // Never forward what we could not prove we stored.
      persistFailure = new PersistError(
        error
          ? `a log line did not persist (reference ${logInternal("generation: generation_events batch insert failed", error)})`
          : `a log line did not persist (${rows.length} of ${batch.length} rows came back)`
      );
      return;
    }
    // Postgres returns a multi-row insert in the order it was given, so index
    // i of the result is index i of the batch.
    for (let i = 0; i < batch.length; i++) {
      forward(batch[i].kind, batch[i].content, rows[i].id, rows[i].created_at);
    }
  };

  const queueFlush = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushChain = flushChain.then(flush); // serialized: ordering is preserved
  };

  const scheduleFlush = () => {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushChain = flushChain.then(flush);
    }, EVENT_BATCH_MS);
  };

  /** Wait for everything buffered to be stored + forwarded; throw on failure. */
  const drainEvents = async (): Promise<void> => {
    queueFlush();
    await flushChain;
    if (persistFailure !== null) throw persistFailure;
  };

  const emit = async (
    kind: GenerationEventKind,
    content: string
  ): Promise<void> => {
    if (persistFailure !== null) throw persistFailure;
    if (kind === "text_delta") partialText += content;
    buffer.push({ kind, content });
    if (buffer.length >= EVENT_BATCH_MAX) queueFlush();
    else scheduleFlush();
  };

  const auditLine = async (event: string, detail: string): Promise<void> => {
    const { error } = await supabase.from("audit_events").insert({
      org_id: orgId,
      briefing_id: briefingId,
      event,
      detail,
      actor: prepared.userLabel,
      actor_user_id: prepared.userId,
    });
    if (error) {
      logInternal(`generation: ${event} audit line failed`, error);
    }
  };

  const handlers: BriefingHandlers = {
    onStatus: (c) => emit("status", c),
    onThinking: (c) => emit("thinking", c),
    onToolCall: (c) => emit("tool_call", c),
    onText: (c) => emit("text_delta", c),
  };

  try {
    await emit(
      "status",
      `Planning the briefing across ${documents.length} source${documents.length === 1 ? "" : "s"} with ${model}.`
    );

    const raw = await streamBriefing({
      model,
      documents,
      requestedTitle,
      handlers,
    });

    const { sections, verified, total } = verifyCitations(raw.sections, docMap);
    await emit(
      "status",
      total === 0
        ? "No citations were offered — grounding is shown by the source list."
        : `Checked citations against the sources — ${verified} of ${total} verified.`
    );

    // Every buffered line must be stored before the briefing is marked
    // complete — otherwise a COMPLETE row could reference a log that is still
    // in memory, and a crash here would leave a finished briefing with a
    // truncated replay.
    await drainEvents();

    const finalTitle = requestedTitle ?? raw.title;
    const bodyMd =
      partialText.trim() !== ""
        ? partialText.trim()
        : renderBodyFromSections(finalTitle, sections);
    const words = wordCount(bodyMd);

    const { error: updateError } = await supabase
      .from("briefings")
      .update({
        status: "complete",
        title: finalTitle,
        body_md: bodyMd,
        sections,
        word_count: words,
        citation_count: verified,
        completed_at: new Date().toISOString(),
      })
      .eq("id", briefingId)
      .select("id")
      .single();
    if (updateError) {
      throw new PersistError(
        `finalizing the briefing failed (reference ${logInternal("generation: briefing finalize update failed", updateError)})`
      );
    }

    if (total > 0) {
      await auditLine("CHECK", `${verified} of ${total} citations verified against sources`);
    }
    await auditLine(
      "COMPLETE",
      `${sections.sections.length} sections · ${words} words · ${verified} citations`
    );

    await emit("status", "Briefing complete.");
    await drainEvents();

    const done: StreamMessage = {
      type: "done",
      briefingId,
      status: "complete",
      wordCount: words,
      citationCount: verified,
      error: null,
    };
    if (sink !== null && !clientGone) {
      try {
        sink(done);
      } catch {
        clientGone = true;
      }
    }
    return {
      status: "complete",
      wordCount: words,
      citationCount: verified,
      error: null,
    };
  } catch (cause) {
    const message = humanFailure(cause);

    // Stop any pending flush timer, then try once to store whatever is still
    // buffered. If persistence is what broke, this is a no-op by design — the
    // failure note below is written directly and is what the reader sees.
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    try {
      await drainEvents();
    } catch {
      // Already failing; the note below is the truthful record.
    }

    // Mark the run failed, keeping the partial body that streamed (the partial
    // LOG is already persisted as generation_events rows). This write's error
    // is checked; if the DB itself is down we can only log, having nothing
    // truthful left to persist.
    const { error: failError } = await supabase
      .from("briefings")
      .update({
        status: "failed",
        body_md: partialText.trim() === "" ? null : partialText.trim(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", briefingId)
      .select("id");
    if (failError) {
      logInternal("generation: marking the briefing failed ALSO failed", failError);
    }

    // A truthful failure note in the log (no false COMPLETE audit is written).
    const { error: noteError } = await supabase
      .from("generation_events")
      .insert({
        briefing_id: briefingId,
        org_id: orgId,
        kind: "status",
        content: `This briefing didn't finish — ${message}`,
      });
    if (noteError) {
      logInternal("generation: failure note did not persist", noteError);
    }

    const done: StreamMessage = {
      type: "done",
      briefingId,
      status: "failed",
      wordCount: null,
      citationCount: null,
      error: message,
    };
    if (sink !== null && !clientGone) {
      try {
        sink(done);
      } catch {
        clientGone = true;
      }
    }
    return {
      status: "failed",
      wordCount: null,
      citationCount: null,
      error: message,
    };
  }
}
