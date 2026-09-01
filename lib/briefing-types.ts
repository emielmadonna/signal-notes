// Shared types for the briefing generation engine (card-010).
//
// This module is the contract between three surfaces:
//   - the generation orchestration in lib/ai/,
//   - the two API routes (generate + events replay/tail),
//   - and the UI that reads a briefing's `sections` jsonb.
//
// It contains NO prompt text (rule 5 keeps prompts in lib/prompts/) and NO
// Anthropic client code — only plain data shapes and the model allowlist.

// ---------------------------------------------------------------------------
// Model allowlist (P0.6 short list; DESIGN-SPEC §5 D1 model picker).
// The server validates the requested model against THIS list and never trusts
// the raw client string. Default is Sonnet 5 (balanced).
// ---------------------------------------------------------------------------

export const ALLOWED_MODELS = [
  "claude-sonnet-5", // balanced — the default
  "claude-opus-5", // deepest
  "claude-haiku-4-5", // fastest
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const DEFAULT_MODEL: AllowedModel = "claude-sonnet-5";

/**
 * Returns the requested model if (and only if) it is on the allowlist,
 * otherwise null. An absent/blank request resolves to the default. Never
 * trust the client string past this gate.
 */
export function resolveModel(requested: unknown): AllowedModel | null {
  if (requested === undefined || requested === null || requested === "") {
    return DEFAULT_MODEL;
  }
  if (typeof requested !== "string") return null;
  return (ALLOWED_MODELS as readonly string[]).includes(requested)
    ? (requested as AllowedModel)
    : null;
}

// ---------------------------------------------------------------------------
// generation_events kinds (migration 0001) — the activity-log vocabulary.
// DESIGN-SPEC §4 maps the canvas tags onto these four:
//   PLAN/WRITE/DONE/CHECK -> status, THINK -> thinking, TOOL -> tool_call,
//   the streaming body -> text_delta.
// ---------------------------------------------------------------------------

export type GenerationEventKind =
  | "status"
  | "thinking"
  | "tool_call"
  | "text_delta";

// ---------------------------------------------------------------------------
// The structured briefing the reading view renders (migration 0002:
// briefings.sections jsonb). Stored as an OBJECT with a lede and a section
// list — lib/workspace-data.ts's excerptFromSections reads exactly this shape
// (it prefers `.lede`, then the first `.sections[].paragraphs[]`).
// ---------------------------------------------------------------------------

/** One citation: the exact source passage + which document it came from. */
export type BriefingCitation = {
  /** The source document (always one of the briefing's bound sources). */
  document_id: string;
  /** The EXACT passage quoted from that document (verified server-side). */
  quote: string;
  /** Human label naming the document, e.g. its title (for the tooltip). */
  label: string;
};

export type BriefingSection = {
  head: string;
  paragraphs: string[];
  citations: BriefingCitation[];
};

export type BriefingSections = {
  /** Short serif lede shown above the sections. */
  lede: string;
  sections: BriefingSection[];
};

// ---------------------------------------------------------------------------
// The request body POST /api/briefings/generate accepts.
// ---------------------------------------------------------------------------

export type GenerateRequest = {
  documentIds: string[];
  title?: string;
  model?: string;
};

// ---------------------------------------------------------------------------
// SSE payload shapes. Both routes speak the same wire language so a client can
// consume the live generate stream and the replay/tail stream with one parser.
//
//  - "event" carries one activity-log line (mirrors a generation_events row).
//  - "done"  is the terminal marker (status = complete | failed) + final
//            counts, sent once at the end of a stream.
// ---------------------------------------------------------------------------

export type StreamEvent = {
  type: "event";
  /** generation_events.id once persisted; omitted for the rare unpersisted line. */
  id?: number;
  kind: GenerationEventKind;
  content: string;
  /** ISO timestamp (created_at once persisted, else emit time). */
  at: string;
};

export type StreamDone = {
  type: "done";
  briefingId: string;
  status: "complete" | "failed";
  wordCount: number | null;
  citationCount: number | null;
  /** Human-readable failure detail when status = failed. */
  error: string | null;
};

export type StreamMessage = StreamEvent | StreamDone;
