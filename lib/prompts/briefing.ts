// =============================================================================
// lib/prompts/briefing.ts — THE briefing generation prompt.
//
// OPERATIONS SURFACE, VERSIONED ON PURPOSE (constitution rule 5).
// Every word the model reads lives here and NOWHERE ELSE: the system prompt,
// the user message, the three tool descriptions, and the mid-loop protocol
// messages the engine feeds back to the model. Handlers in lib/ai/ and
// app/api/ import these; they never inline model-facing strings.
// This is so prompts get reviewed and versioned like the operational asset
// they are — bump BRIEFING_PROMPT_VERSION on any change to the text below, and
// the version rides along on the run so a briefing is always traceable to the
// exact instructions that produced it.
//
// The design contract this prompt must satisfy (DESIGN-SPEC §3 GENERATION):
//   (a) ground STRICTLY in the supplied documents and nothing else,
//   (b) a titled briefing of ~5-7 sections with a short lede,
//   (c) citations that quote the EXACT source passage and name the document,
//   (d) narrate the work (rule 8) — real tool calls, not theater.
// =============================================================================

// v2 (2026-09-01.2): the mid-loop protocol messages the model reads — the
// submit nudge, the out-of-set read refusal, and the resubmit correction —
// were relocated here from lib/ai (catch #18, rule 5: EVERY word the model
// reads lives in lib/prompts and nowhere else). No change to the grounding
// instructions themselves.
// v3 (2026-09-01.3): added TRUNCATION_NOTICE, the marker appended to a
// read_document result whose document was too long to send whole. It is text
// the model reads, so rule 5 puts it here rather than in lib/ai.
export const BRIEFING_PROMPT_VERSION = "briefing-2026-09-01.3";

// ---------------------------------------------------------------------------
// Protocol messages (model-facing). These are strings the engine feeds back to
// the model DURING the tool loop — not narration for the human reader. They
// live here for the same reason the system prompt does: they are words the
// model reads, and rule 5 keeps every such word in lib/prompts/.
// ---------------------------------------------------------------------------

/** Sent when the model ended its turn without ever calling submit_briefing. */
export const SUBMIT_NUDGE =
  "Now call submit_briefing with the structured briefing you just wrote.";

/** tool_result for a read_document call naming a document outside the sources. */
export const READ_OUT_OF_SET_REFUSAL =
  "That document id is not in this briefing's source set. You may only read the listed sources.";

/** tool_result when submit_briefing arrives with an unusable structure. */
export const RESUBMIT_CORRECTION =
  "The briefing structure was unusable. Resubmit with a non-empty title and at least one section, each section having paragraphs.";

/** Acknowledgement tool_results for the well-formed tool calls. */
export const NOTE_THEME_ACK = "Noted.";
export const SUBMIT_BRIEFING_ACK = "Recorded.";
export const UNKNOWN_TOOL_RESULT = "Unknown tool.";

/**
 * Appended to a read_document result that had to be cut short. The model must
 * know it is looking at a prefix — otherwise it can confidently summarise a
 * document whose second half it never saw, and neither the reader nor the
 * citation verifier would notice the difference.
 */
export function truncationNotice(sentChars: number, totalChars: number): string {
  return (
    `\n\n[Only the first ${sentChars.toLocaleString("en-US")} characters of this ` +
    `document are shown; it is ${totalChars.toLocaleString("en-US")} characters long. ` +
    `Base your briefing only on the text above, and say in the briefing that this ` +
    `source was read in part.]`
  );
}

// ---------------------------------------------------------------------------
// Tool descriptions (model-facing). The engine wires these onto real tools:
//   read_document  — returns the stored body of a bound source document,
//   note_theme     — records a theme the model has identified (log only),
//   submit_briefing— delivers the final structured briefing.
// ---------------------------------------------------------------------------

export const READ_DOCUMENT_TOOL_DESCRIPTION =
  "Return the full stored text of one of the source documents listed in the " +
  "task. You have NOT been given the documents' contents up front — you must " +
  "read each one with this tool before you can ground anything in it. You may " +
  "only pass a document_id that appears in the task's source list; any other " +
  "id is refused. Call it once per document you intend to use.";

export const NOTE_THEME_TOOL_DESCRIPTION =
  "Record a theme, tension, or through-line you have identified across the " +
  "documents you have read. This is a lightweight note for the activity log " +
  "the reader watches — it has no other effect. Use it to show your thinking " +
  "as you move from reading toward drafting. Optional but encouraged.";

export const SUBMIT_BRIEFING_TOOL_DESCRIPTION =
  "Deliver the finished briefing as structured data. Call this exactly once, " +
  "as your final action, AFTER you have written the briefing prose in your " +
  "message text. The structure you submit must match the prose you just " +
  "wrote. Every citation's `quote` must be copied VERBATIM from the source " +
  "document named by its `document_id` — do not paraphrase, and do not cite a " +
  "document you did not read.";

// JSON Schemas for the three tools (kept beside their descriptions on purpose).

export const READ_DOCUMENT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    document_id: {
      type: "string",
      description: "The id of a source document from the task's list.",
    },
  },
  required: ["document_id"],
  additionalProperties: false,
} as const;

export const NOTE_THEME_INPUT_SCHEMA = {
  type: "object",
  properties: {
    theme: {
      type: "string",
      description: "The theme or through-line, in one short sentence.",
    },
    evidence: {
      type: "string",
      description:
        "Optional: which document(s) or moments support this theme.",
    },
  },
  required: ["theme"],
  additionalProperties: false,
} as const;

export const SUBMIT_BRIEFING_INPUT_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "A specific, informative title for the briefing.",
    },
    lede: {
      type: "string",
      description:
        "A short lede (1-3 sentences) that frames what the briefing covers.",
    },
    sections: {
      type: "array",
      minItems: 3,
      description: "The briefing's sections, in reading order (aim for 5-7).",
      items: {
        type: "object",
        properties: {
          head: {
            type: "string",
            description: "A short section heading.",
          },
          paragraphs: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
            description: "The section's paragraphs, as plain prose strings.",
          },
          citations: {
            type: "array",
            description:
              "Passages from the source documents that ground this section.",
            items: {
              type: "object",
              properties: {
                document_id: {
                  type: "string",
                  description:
                    "The source document this quote is copied from.",
                },
                quote: {
                  type: "string",
                  description:
                    "The exact passage, copied verbatim from that document.",
                },
                label: {
                  type: "string",
                  description:
                    "A human label naming the document (its title).",
                },
              },
              required: ["document_id", "quote", "label"],
              additionalProperties: false,
            },
          },
        },
        required: ["head", "paragraphs", "citations"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "lede", "sections"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(): string {
  return [
    "The role: a careful analyst who writes grounded briefings for an",
    "organization's team. The reader trusts this briefing precisely because",
    "every claim can be traced to a source they provided.",
    "",
    "THE ONE UNBREAKABLE RULE — GROUNDING:",
    "Ground every statement STRICTLY in the source documents supplied for this",
    "task, and in nothing else. Do not add outside facts, general knowledge,",
    "figures, dates, names, or events that are not present in those documents.",
    "If the documents do not support a point, do not make it. If the documents",
    "conflict, say so plainly rather than resolving it with invention. It is",
    "far better to write a shorter briefing that is fully grounded than a",
    "fuller one that reaches beyond the sources.",
    "",
    "YOU HAVE NOT BEEN GIVEN THE DOCUMENTS' CONTENTS.",
    "The task lists the source documents by id and title only. Before you can",
    "ground anything, read each document you intend to use with the",
    "read_document tool. You may only read documents on that list — no others",
    "exist for you.",
    "",
    "HOW TO WORK (and narrate it — the reader watches a live activity log):",
    "1. Read the source documents with read_document, one call per document.",
    "2. As themes and tensions emerge, record them with note_theme so the",
    "   reader can follow your reasoning. Think out loud as you go.",
    "3. When you are ready, WRITE THE BRIEFING as prose in your message text.",
    "   This prose streams live to the reader as the centerpiece, so write the",
    "   finished briefing here — a clear title line, a short lede, then the",
    "   sections. Aim for about five to seven sections. Do not write briefing",
    "   prose before this step; until then, use the tools and your thinking.",
    "4. As your final action, call submit_briefing with the SAME briefing in",
    "   structured form: the title, the lede, and each section with its",
    "   paragraphs and its citations.",
    "",
    "CITATIONS:",
    "A citation quotes an EXACT passage from a source document and names which",
    "document it came from. Copy the quote verbatim — character for character —",
    "from the document you read; a quote that is not a literal substring of its",
    "source will be rejected and dropped. Attach citations to the sections they",
    "support; a section may carry several. Cite generously but honestly: only",
    "quote what you actually read.",
    "",
    "TONE:",
    "Plain, direct English for a busy professional reader. Specific over vague.",
    "No filler, no hedging boilerplate, no restating the instructions.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// User message — lists the bound source documents (id + title + kind + type)
// WITHOUT their bodies, and states the request. Bodies arrive only through
// read_document, so the tool calls are real work, not decoration.
// ---------------------------------------------------------------------------

export type PromptDocument = {
  id: string;
  title: string;
  kind: string;
  ext: string;
};

const KIND_LABELS: Record<string, string> = {
  interview_notes: "interview notes",
  call_transcript: "call transcript",
  web_copy: "web copy",
  other: "document",
};

export function buildUserMessage(
  documents: PromptDocument[],
  requestedTitle?: string | null
): string {
  const lines: string[] = [];
  lines.push(
    `Write a grounded briefing from the following ${documents.length} source ` +
      `document${documents.length === 1 ? "" : "s"}. These are the ONLY ` +
      "sources you may use, and you must read each one before grounding in it."
  );
  lines.push("");
  lines.push("SOURCE DOCUMENTS (read them with read_document):");
  for (const doc of documents) {
    const kind = KIND_LABELS[doc.kind] ?? doc.kind;
    lines.push(
      `- id: ${doc.id}\n  title: ${doc.title}\n  type: ${kind} (${doc.ext})`
    );
  }
  lines.push("");
  if (requestedTitle && requestedTitle.trim() !== "") {
    lines.push(
      `The reader has suggested a working title: "${requestedTitle.trim()}". ` +
        "Use it if it fits what the sources actually support; otherwise choose " +
        "a truer one."
    );
  } else {
    lines.push(
      "Choose a specific title that reflects what the sources actually say."
    );
  }
  lines.push("");
  lines.push(
    "Begin by reading the documents. Narrate your work as you go, then write " +
      "the briefing and submit it."
  );
  return lines.join("\n");
}
