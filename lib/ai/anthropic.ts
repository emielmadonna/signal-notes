// =============================================================================
// lib/ai/anthropic.ts — the server-side Anthropic client + the streaming
// model loop for briefing generation (card-010).
//
// SERVER ONLY. This module is imported exclusively by the API route handlers
// (runtime = "nodejs"); it never reaches the browser bundle. The Anthropic
// API key is read by the SDK from the server environment at construction time
// via `new Anthropic()` — the key string is never handled, logged, or named
// in code here, so it stays as private as the Supabase service-role key
// (constitution hard boundaries; the verifier's KEY check enforces both).
//
// Every model-facing string (the instructions, the user message, the tool
// descriptions + schemas) comes from lib/prompts/briefing.ts (rule 5). This
// file only wires those onto real tools and drives the streaming/tool loop.
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  buildUserMessage,
  READ_DOCUMENT_TOOL_DESCRIPTION,
  READ_DOCUMENT_INPUT_SCHEMA,
  NOTE_THEME_TOOL_DESCRIPTION,
  NOTE_THEME_INPUT_SCHEMA,
  SUBMIT_BRIEFING_TOOL_DESCRIPTION,
  SUBMIT_BRIEFING_INPUT_SCHEMA,
  SUBMIT_NUDGE,
  READ_OUT_OF_SET_REFUSAL,
  RESUBMIT_CORRECTION,
  NOTE_THEME_ACK,
  SUBMIT_BRIEFING_ACK,
  UNKNOWN_TOOL_RESULT,
  truncationNotice,
  type PromptDocument,
} from "@/lib/prompts/briefing";
import type { AllowedModel, BriefingSections } from "@/lib/briefing-types";

// ---------------------------------------------------------------------------
// Client (lazy singleton). The SDK resolves credentials from the server
// environment; a bare constructor is the documented default.
// ---------------------------------------------------------------------------

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient === null) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// A bound source document: everything the tools and the verifier need. The
// body is present in memory (already loaded, org-scoped, RLS-checked by the
// caller), so read_document is an in-memory lookup over the bound set — the
// model physically cannot read anything outside this briefing's sources.
// ---------------------------------------------------------------------------

export type BoundDocument = PromptDocument & { body: string };

// The handlers the orchestration supplies. Each corresponds to a
// generation_events kind; the orchestration persists + forwards each call.
export type BriefingHandlers = {
  onStatus: (content: string) => Promise<void>;
  onThinking: (content: string) => Promise<void>;
  onToolCall: (content: string) => Promise<void>;
  onText: (content: string) => Promise<void>;
};

// The structured result the model submits (before server-side verification).
export type RawBriefingResult = {
  title: string;
  sections: BriefingSections;
};

// Thrown when the model finishes without ever submitting a briefing.
export class NoBriefingSubmittedError extends Error {
  constructor() {
    super("The model finished without submitting a briefing.");
    this.name = "NoBriefingSubmittedError";
  }
}

const MAX_TURNS = 16; // read N docs + note themes + write + submit, with headroom

/**
 * How many times we may ask a model that stopped without submitting to call
 * submit_briefing.
 *
 * The code below used to say "nudge it once" in a comment and then nudge on
 * EVERY non-tool_use turn, all the way to MAX_TURNS. Each pass re-sends the
 * entire accumulated history — every thinking block, every full document body
 * returned by read_document, and any prose the model has already written — so
 * a model that keeps writing the briefing as TEXT instead of calling the tool
 * grows the request quadratically. The terminal state is not a graceful stop
 * but a hard 400 from the model service (observed: a run that reached turn 13
 * and died with "the model service returned an error (400)" after streaming a
 * complete draft).
 *
 * Two attempts is enough to correct a model that simply forgot the tool. Past
 * that we stop and fail honestly, which preserves the partial draft and the
 * log instead of burning turns and tokens on a request that is going to be
 * rejected anyway.
 */
const MAX_SUBMIT_NUDGES = 2;
const MAX_TOKENS = 16000;
const CHUNK_THRESHOLD = 180; // flush streamed text/thinking in ~180-char chunks

/**
 * The most text one read_document result may carry. Uploads are capped at
 * 20 MB, and a 20 MB .txt is ~5M tokens — far past any context window — so
 * without this an entirely legitimate upload turned every generation into an
 * opaque "the model service returned an error". ~240k characters is roughly
 * 60k tokens: comfortably inside the window, with room for the other sources
 * and the model's own output. Past the cap the model is TOLD it is reading a
 * prefix (truncationNotice) rather than being silently misled.
 */
const MAX_DOCUMENT_CHARS = 240_000;

/** doc.body, trimmed to the cap and labelled honestly when it was trimmed. */
function documentPayload(body: string): string {
  if (body.length <= MAX_DOCUMENT_CHARS) return body;
  return (
    body.slice(0, MAX_DOCUMENT_CHARS) +
    truncationNotice(MAX_DOCUMENT_CHARS, body.length)
  );
}

// Thinking config is model-dependent: the current models take adaptive
// thinking (summarized so the reader sees real reasoning); Haiku 4.5 predates
// adaptive and takes an explicit budget. Cast because the SDK's static union
// is narrower than the set of shapes the API accepts across model families.
function thinkingConfig(model: AllowedModel): Anthropic.ThinkingConfigParam {
  if (model === "claude-haiku-4-5") {
    return { type: "enabled", budget_tokens: 4000 };
  }
  return { type: "adaptive", display: "summarized" };
}

function toolDefs(): Anthropic.Tool[] {
  return [
    {
      name: "read_document",
      description: READ_DOCUMENT_TOOL_DESCRIPTION,
      input_schema:
        READ_DOCUMENT_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
    },
    {
      name: "note_theme",
      description: NOTE_THEME_TOOL_DESCRIPTION,
      input_schema:
        NOTE_THEME_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
    },
    {
      name: "submit_briefing",
      description: SUBMIT_BRIEFING_TOOL_DESCRIPTION,
      input_schema:
        SUBMIT_BRIEFING_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
    },
  ];
}

function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Defensive coercion of the model's submit_briefing input into our shape.
// Returns null if the payload is unusable (missing title/sections). Anything
// odd inside is normalized rather than trusted.
// ---------------------------------------------------------------------------

function coerceResult(input: unknown): RawBriefingResult | null {
  if (input === null || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const lede = typeof obj.lede === "string" ? obj.lede.trim() : "";
  if (!Array.isArray(obj.sections)) return null;

  const sections = obj.sections
    .map((raw) => {
      if (raw === null || typeof raw !== "object") return null;
      const s = raw as Record<string, unknown>;
      const head = typeof s.head === "string" ? s.head.trim() : "";
      const paragraphs = Array.isArray(s.paragraphs)
        ? s.paragraphs
            .filter((p): p is string => typeof p === "string")
            .map((p) => p.trim())
            .filter((p) => p !== "")
        : [];
      const citations = Array.isArray(s.citations)
        ? s.citations
            .map((raw2) => {
              if (raw2 === null || typeof raw2 !== "object") return null;
              const c = raw2 as Record<string, unknown>;
              const document_id =
                typeof c.document_id === "string" ? c.document_id : "";
              const quote = typeof c.quote === "string" ? c.quote : "";
              const label = typeof c.label === "string" ? c.label : "";
              if (document_id === "" || quote === "") return null;
              return { document_id, quote, label };
            })
            .filter((c): c is NonNullable<typeof c> => c !== null)
        : [];
      if (head === "" && paragraphs.length === 0) return null;
      return { head, paragraphs, citations };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (title === "" || sections.length === 0) return null;
  return { title, sections: { lede, sections } };
}

// ---------------------------------------------------------------------------
// The streaming model loop. Drives read → note → write → submit, streaming
// every text/thinking chunk and tool call through the handlers. Returns the
// raw (unverified) submitted briefing. Throws on API failure or if the model
// never submits — the orchestration turns either into an honest failed run.
// ---------------------------------------------------------------------------

export async function streamBriefing(params: {
  model: AllowedModel;
  documents: BoundDocument[];
  requestedTitle: string | null;
  handlers: BriefingHandlers;
}): Promise<RawBriefingResult> {
  const { model, documents, requestedTitle, handlers } = params;
  const client = getAnthropicClient();
  const docMap = new Map(documents.map((d) => [d.id, d]));

  const system = buildSystemPrompt();
  const tools = toolDefs();
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildUserMessage(
        documents.map(({ id, title, kind, ext }) => ({
          id,
          title,
          kind,
          ext,
        })),
        requestedTitle
      ),
    },
  ];

  let submitted: RawBriefingResult | null = null;
  let nudges = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system,
      thinking: thinkingConfig(model),
      tools,
      messages,
    });

    // Stream text + thinking live, flushing in readable chunks.
    let buf = "";
    let bufKind: "text" | "thinking" | null = null;
    const flush = async () => {
      if (bufKind === null || buf === "") return;
      const chunk = buf;
      buf = "";
      if (bufKind === "text") await handlers.onText(chunk);
      else await handlers.onThinking(chunk);
    };

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        await flush();
        const block = event.content_block;
        bufKind =
          block.type === "text"
            ? "text"
            : block.type === "thinking"
              ? "thinking"
              : null;
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          bufKind = "text";
          buf += delta.text;
          if (buf.length >= CHUNK_THRESHOLD) await flush();
        } else if (delta.type === "thinking_delta") {
          bufKind = "thinking";
          buf += delta.thinking;
          if (buf.length >= CHUNK_THRESHOLD) await flush();
        }
      } else if (event.type === "content_block_stop") {
        await flush();
        bufKind = null;
      }
    }
    await flush();

    const final = await stream.finalMessage();
    // Echo the assistant turn back (thinking + tool_use blocks included) so
    // continuing on the same model stays well-formed — but DROP any empty text
    // block first. The API rejects a re-sent zero-length text block with a 400
    // ("text content blocks must be non-empty"), which streaming occasionally
    // produces; filtering them is harmless (order and thinking blocks survive).
    messages.push({
      role: "assistant",
      content: final.content.filter(
        (block) => !(block.type === "text" && block.text.trim() === "")
      ),
    });

    if (final.stop_reason !== "tool_use") {
      // The model ended its turn without a tool call. If it already submitted,
      // we are done. Otherwise nudge it toward submit_briefing — but only
      // MAX_SUBMIT_NUDGES times, because every extra pass re-sends the whole
      // conversation and walks the request toward the context limit.
      if (submitted !== null) break;
      if (++nudges > MAX_SUBMIT_NUDGES) break; // -> NoBriefingSubmittedError
      messages.push({ role: "user", content: SUBMIT_NUDGE });
      continue;
    }

    // Execute every tool_use block; collect all results into ONE user message.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;

      if (block.name === "read_document") {
        const id =
          block.input && typeof block.input === "object"
            ? (block.input as { document_id?: unknown }).document_id
            : undefined;
        const doc = typeof id === "string" ? docMap.get(id) : undefined;
        if (!doc) {
          await handlers.onToolCall(
            "Refused a read of a document outside this briefing's sources."
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: READ_OUT_OF_SET_REFUSAL,
          });
          continue;
        }
        const payload = documentPayload(doc.body);
        const truncated = payload.length !== doc.body.length;
        await handlers.onToolCall(
          truncated
            ? `Reading "${doc.title}" — first ${wordCount(payload)} of ${wordCount(doc.body)} words (source too long to read whole)`
            : `Reading "${doc.title}" — ${wordCount(doc.body)} words`
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: payload,
        });
      } else if (block.name === "note_theme") {
        const theme =
          block.input && typeof block.input === "object"
            ? (block.input as { theme?: unknown }).theme
            : undefined;
        if (typeof theme === "string" && theme.trim() !== "") {
          await handlers.onStatus(`Theme — ${theme.trim()}`);
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: NOTE_THEME_ACK,
        });
      } else if (block.name === "submit_briefing") {
        const coerced = coerceResult(block.input);
        if (coerced === null) {
          await handlers.onStatus(
            "The submitted briefing was malformed — asking for a corrected version."
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: RESUBMIT_CORRECTION,
          });
        } else {
          submitted = coerced;
          await handlers.onStatus("Assembling the structured briefing.");
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: SUBMIT_BRIEFING_ACK,
          });
        }
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: UNKNOWN_TOOL_RESULT,
        });
      }
    }

    // A well-formed submission ends the run — no further model turn is needed.
    if (submitted !== null) break;

    messages.push({ role: "user", content: toolResults });
  }

  if (submitted === null) {
    throw new NoBriefingSubmittedError();
  }
  return submitted;
}
