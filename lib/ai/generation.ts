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
import {
  resolveModel,
  type AllowedModel,
  type BriefingSections,
  type GenerationEventKind,
  type GenerateRequest,
  type StreamMessage,
} from "@/lib/briefing-types";

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

  const requestedTitle =
    typeof req.title === "string" && req.title.trim() !== ""
      ? req.title.trim()
      : null;

  // The user's org — named column, scoped to their own membership row.
  const { data: memberships, error: orgError } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1);
  if (orgError) {
    return {
      failure: {
        status: 500,
        error: `We couldn't look up your organization: ${orgError.message}`,
      },
    };
  }
  if (!memberships || memberships.length === 0) {
    return {
      failure: {
        status: 403,
        error: "Your account isn't in an organization yet.",
      },
    };
  }
  const orgId = memberships[0].org_id as string;

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
        error: `We couldn't load the selected documents: ${docError.message}`,
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
        error: `Starting the briefing failed: ${briefingError?.message ?? "no row came back"}. Nothing was created.`,
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
    return {
      failure: {
        status: 500,
        error: rolledBackOk
          ? `Binding the source documents failed: ${sourcesError.message}. The briefing was rolled back.`
          : `Binding the source documents failed: ${sourcesError.message}. The empty briefing could NOT be rolled back${rollbackError ? ` (${rollbackError.message})` : ""} and may still appear — delete it and try again.`,
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
    console.error(`RUN STARTED audit line failed: ${runAuditError.message}`);
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
    console.error(`SOURCE BOUND audit lines failed: ${boundAuditError.message}`);
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

function humanFailure(cause: unknown): string {
  if (cause instanceof NoBriefingSubmittedError) {
    return "the analysis didn't produce a finished briefing. Try again.";
  }
  if (cause instanceof PersistError) {
    return `a database write failed mid-run (${cause.message}). Try again.`;
  }
  if (cause instanceof Anthropic.APIError) {
    return `the model service returned an error (${cause.status ?? "network"}). Try again.`;
  }
  if (cause instanceof Error) {
    return `${cause.message}. Try again.`;
  }
  return "an unexpected error occurred. Try again.";
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

  // Persist one generation_events row, then (best-effort) forward it live. A
  // persistence failure throws — the run fails honestly. A forward failure
  // means the client left; persistence already happened, so the run continues.
  const emit = async (
    kind: GenerationEventKind,
    content: string
  ): Promise<void> => {
    if (kind === "text_delta") partialText += content;
    const { data, error } = await supabase
      .from("generation_events")
      .insert({ briefing_id: briefingId, org_id: orgId, kind, content })
      .select("id, created_at")
      .single();
    if (error || !data) {
      throw new PersistError(
        error?.message ?? "a log line did not persist"
      );
    }
    const row = data as { id: number; created_at: string };
    if (sink !== null && !clientGone) {
      try {
        sink({ type: "event", id: row.id, kind, content, at: row.created_at });
      } catch {
        clientGone = true; // client disconnected; keep persisting to the DB
      }
    }
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
      console.error(`${event} audit line failed: ${error.message}`);
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
        `finalizing the briefing failed: ${updateError.message}`
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
      console.error(`marking briefing failed also failed: ${failError.message}`);
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
      console.error(`failure note did not persist: ${noteError.message}`);
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
