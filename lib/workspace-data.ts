"use client";

// Workspace data layer (P3 card-007). The clean seam P2 promised, now
// carrying REAL rows: the workspace fetches its documents and briefings
// through this hook and never touches supabase anywhere else.
//
// Constitution rules in play here:
//   R2  every select names its columns — including every field of every
//       nested (embedded) resource; no select("*"), ever.
//   R3  the briefing delete's { error } is returned to the caller so the
//       UI can surface it; no empty catch.
//   R9  fetches abort on unmount/refetch (AbortController) and ANY
//       { error } becomes the section's error state — a failed request
//       never renders as empty success.
//   R10 mutation helpers below update local state optimistically; nothing
//       refetches the world after a write.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SectionStateKind = "loading" | "empty" | "error" | "populated";

// ---------------------------------------------------------------------------
// Row shapes (exactly the named columns the UI reads)
// ---------------------------------------------------------------------------

export type WorkspaceDocument = {
  id: string;
  title: string;
  kind: string;
  ext: string;
  /** Original upload name; null for pasted text (migration 0002). */
  file_name: string | null;
  size_bytes: number;
  created_at: string;
  /** auth.users id; auth.users itself is NOT client-readable (see note). */
  added_by: string | null;
};

export type BriefingSourceDoc = {
  id: string;
  title: string;
  ext: string;
  file_name: string | null;
  size_bytes: number;
};

export type BriefingStatus = "generating" | "complete" | "failed";

export type WorkspaceBriefing = {
  id: string;
  title: string | null;
  status: BriefingStatus;
  model: string;
  created_at: string;
  completed_at: string | null;
  word_count: number | null;
  citation_count: number | null;
  /** First sentence of the lede (or a body excerpt) from sections; null
   *  when no sections exist yet — the card renders an em-dash then. */
  excerpt: string | null;
  /** The real source documents (briefing_sources → documents). */
  sources: BriefingSourceDoc[];
  /** Margin-note count (briefing_notes). */
  notesCount: number;
  /** The signed-in user's own rating; null when they haven't rated. */
  myRating: "up" | "down" | null;
};

export type Section<Row> = {
  state: SectionStateKind;
  /** The fetched rows; empty while loading, on error, and when truly empty. */
  rows: Row[];
  /** Human-readable failure detail (error state only). */
  errorDetail: string | null;
};

function loadingSection<Row>(): Section<Row> {
  return { state: "loading", rows: [], errorDetail: null };
}

function errorSection<Row>(detail: string): Section<Row> {
  // Rule 9: non-2xx / transport failure is an ERROR, never "no data yet".
  return { state: "error", rows: [], errorDetail: detail };
}

function populatedSection<Row>(rows: Row[]): Section<Row> {
  return {
    state: rows.length > 0 ? "populated" : "empty",
    rows,
    errorDetail: null,
  };
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchDocuments(
  signal: AbortSignal
): Promise<Section<WorkspaceDocument>> {
  const supabase = createClient();
  // Named columns only (R2): the tile reads exactly these. `body` (the heavy
  // extracted text) deliberately does not ride along. RLS scopes rows to the
  // caller's org (R1) — no explicit org filter needed or wanted.
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, kind, ext, file_name, size_bytes, created_at, added_by")
    .order("created_at", { ascending: false })
    .abortSignal(signal);

  if (error) return errorSection(error.message);
  if (data === null) return errorSection("The server returned no rows.");
  return populatedSection(data as WorkspaceDocument[]);
}

// The raw nested shape supabase returns for the briefings query below.
// Embedded to-one relations may come back as an object or a 1-element array
// depending on how the relationship is inferred; normalize both.
type RawBriefingRow = {
  id: string;
  title: string | null;
  status: BriefingStatus;
  model: string;
  created_at: string;
  completed_at: string | null;
  word_count: number | null;
  citation_count: number | null;
  sections: unknown;
  briefing_sources:
    | {
        document_id: string;
        documents: BriefingSourceDoc | BriefingSourceDoc[] | null;
      }[]
    | null;
  briefing_notes: { id: string }[] | null;
  briefing_feedback: { rating: "up" | "down" }[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/**
 * Card excerpt from the structured `sections` jsonb (migration 0002: head,
 * paragraphs, citation refs; written by P4's generator). Tolerant on
 * purpose — it prefers the first sentence of the lede, falls back to the
 * first body paragraph, and returns null (→ em-dash on the card) for
 * anything it does not recognize. Never throws on malformed json.
 */
export function excerptFromSections(sections: unknown): string | null {
  if (sections === null || sections === undefined) return null;

  const firstSentence = (text: string): string | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^[^.!?]*[.!?]/);
    const sentence = (match ? match[0] : trimmed).trim();
    // Keep card sub-lines to a readable clamp, mid-word cuts avoided.
    if (sentence.length <= 160) return sentence;
    return `${sentence.slice(0, 157).replace(/\s+\S*$/, "")}…`;
  };

  const fromParagraph = (p: unknown): string | null => {
    if (typeof p === "string") return firstSentence(p);
    if (p && typeof p === "object" && "text" in p) {
      const text = (p as { text: unknown }).text;
      if (typeof text === "string") return firstSentence(text);
    }
    return null;
  };

  const fromSectionList = (list: unknown): string | null => {
    if (!Array.isArray(list)) return null;
    for (const section of list) {
      if (!section || typeof section !== "object") continue;
      const paragraphs = (section as { paragraphs?: unknown }).paragraphs;
      if (Array.isArray(paragraphs)) {
        for (const p of paragraphs) {
          const hit = fromParagraph(p);
          if (hit) return hit;
        }
      }
    }
    return null;
  };

  if (typeof sections === "object" && !Array.isArray(sections)) {
    const lede = (sections as { lede?: unknown }).lede;
    if (typeof lede === "string") {
      const hit = firstSentence(lede);
      if (hit) return hit;
    }
    return fromSectionList((sections as { sections?: unknown }).sections);
  }
  return fromSectionList(sections);
}

async function fetchBriefings(
  signal: AbortSignal
): Promise<Section<WorkspaceBriefing>> {
  const supabase = createClient();

  // The card footer shows the SIGNED-IN user's own rating, so we need the
  // user id to scope the embedded feedback server-side.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) return errorSection(userError.message);
  if (!user) return errorSection("No signed-in user found.");

  // Named columns throughout, INCLUDING every nested resource (R2): a
  // Supabase nested select counts as named only when every field is named.
  // `sections` is read for the card excerpt; `body_md` stays behind.
  const { data, error } = await supabase
    .from("briefings")
    .select(
      [
        "id",
        "title",
        "status",
        "model",
        "created_at",
        "completed_at",
        "word_count",
        "citation_count",
        "sections",
        "briefing_sources (document_id, documents (id, title, ext, file_name, size_bytes))",
        "briefing_notes (id)",
        "briefing_feedback (rating)",
      ].join(", ")
    )
    // Only the caller's own feedback rides along (the org can see all
    // feedback per RLS; the card only speaks for YOUR judgment).
    .eq("briefing_feedback.user_id", user.id)
    .order("created_at", { ascending: false })
    .abortSignal(signal);

  if (error) return errorSection(error.message);
  if (data === null) return errorSection("The server returned no rows.");

  const rows = (data as unknown as RawBriefingRow[]).map(
    (raw): WorkspaceBriefing => ({
      id: raw.id,
      title: raw.title,
      status: raw.status,
      model: raw.model,
      created_at: raw.created_at,
      completed_at: raw.completed_at,
      word_count: raw.word_count,
      citation_count: raw.citation_count,
      excerpt: excerptFromSections(raw.sections),
      sources: (raw.briefing_sources ?? [])
        .map((s) => one(s.documents))
        .filter((d): d is BriefingSourceDoc => d !== null),
      notesCount: (raw.briefing_notes ?? []).length,
      myRating: (raw.briefing_feedback ?? [])[0]?.rating ?? null,
    })
  );
  return populatedSection(rows);
}

// ---------------------------------------------------------------------------
// Briefing deletion (card-007 owns it: pure list work)
// ---------------------------------------------------------------------------

/**
 * Deletes one briefing. Returns a human-readable error, or null on success
 * (R3: the caller MUST surface a non-null error in the UI). The returned
 * row count is checked so an RLS-silenced no-op can never masquerade as a
 * successful delete.
 */
export async function deleteBriefing(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("briefings")
    .delete()
    .eq("id", id)
    .select("id"); // named column (R2); proves a row actually went away
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error: "Nothing was deleted — the briefing may already be gone.",
    };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export type WorkspaceData = {
  briefings: Section<WorkspaceBriefing>;
  documents: Section<WorkspaceDocument>;
  /** Re-runs both fetches (both sections return to loading first). */
  retry: () => void;
  /** Optimistic prepend after an upload/paste succeeds (card-008 uses it). */
  addDocumentToList: (doc: WorkspaceDocument) => void;
  /** Optimistic in-place patch after a rename/edit succeeds (card-009). */
  updateDocumentInList: (
    id: string,
    patch: Partial<Omit<WorkspaceDocument, "id">>
  ) => void;
  /** Optimistic removal after a confirmed document delete (card-009). */
  removeDocumentsFromList: (ids: string[]) => void;
  /** Optimistic removal after a confirmed briefing delete (this card). */
  removeBriefingFromList: (id: string) => void;
};

// R10: every helper below rewrites LOCAL state after a confirmed write —
// no refetch-the-world. A section that was "empty" becomes "populated" the
// moment a row is added, and vice versa, so the four states stay honest.
function withRows<Row>(section: Section<Row>, rows: Row[]): Section<Row> {
  if (section.state === "loading" || section.state === "error") return section;
  return populatedSection(rows);
}

export function useWorkspaceData(): WorkspaceData {
  const [briefings, setBriefings] = useState<Section<WorkspaceBriefing>>(
    loadingSection
  );
  const [documents, setDocuments] = useState<Section<WorkspaceDocument>>(
    loadingSection
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    setBriefings(loadingSection());
    setDocuments(loadingSection());

    // The two fetches land independently so a briefings failure cannot mask
    // a healthy documents section (or vice versa).
    fetchBriefings(signal).then((section) => {
      if (!signal.aborted) setBriefings(section);
    });
    fetchDocuments(signal).then((section) => {
      if (!signal.aborted) setDocuments(section);
    });

    // Rule 9: abort in-flight requests on unmount (and on retry) so a stale
    // response can never race a newer one into the UI.
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const addDocumentToList = useCallback((doc: WorkspaceDocument) => {
    setDocuments((prev) => withRows(prev, [doc, ...prev.rows]));
  }, []);

  const updateDocumentInList = useCallback(
    (id: string, patch: Partial<Omit<WorkspaceDocument, "id">>) => {
      setDocuments((prev) =>
        withRows(
          prev,
          prev.rows.map((d) => (d.id === id ? { ...d, ...patch } : d))
        )
      );
    },
    []
  );

  const removeDocumentsFromList = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setDocuments((prev) =>
      withRows(
        prev,
        prev.rows.filter((d) => !gone.has(d.id))
      )
    );
  }, []);

  const removeBriefingFromList = useCallback((id: string) => {
    setBriefings((prev) =>
      withRows(
        prev,
        prev.rows.filter((b) => b.id !== id)
      )
    );
  }, []);

  return {
    briefings,
    documents,
    retry,
    addDocumentToList,
    updateDocumentInList,
    removeDocumentsFromList,
    removeBriefingFromList,
  };
}
