"use client";

// Workspace data interface (P2 card-5b). This is the clean seam P3 builds
// behind: the workspace shell only ever sees SectionData, never supabase.
// For P2 the hook fetches REAL row counts (head-only, named column — never
// select("*"), constitution R2) so the shell runs live against the database:
//   loading → (fetch) → populated (count > 0) | empty (count === 0) | error.
// Rule 9: the fetch aborts on unmount (AbortController) and a failed request
// NEVER renders as empty success — any { error } becomes the error state.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SectionStateKind = "loading" | "empty" | "error" | "populated";

export type SectionData = {
  state: SectionStateKind;
  /** Row count for populated/empty; null while loading or on error. */
  count: number | null;
  /** Human-readable failure detail (error state only). */
  errorDetail: string | null;
};

const LOADING: SectionData = { state: "loading", count: null, errorDetail: null };

function fromCount(count: number): SectionData {
  return {
    state: count > 0 ? "populated" : "empty",
    count,
    errorDetail: null,
  };
}

function fromError(detail: string): SectionData {
  return { state: "error", count: null, errorDetail: detail };
}

async function fetchCount(
  table: "briefings" | "documents",
  signal: AbortSignal
): Promise<SectionData> {
  const supabase = createClient();
  // head:true transfers zero rows — we only read the exact count. The column
  // is named (id) per constitution R2; RLS scopes the count to the caller's
  // org (R1), so no explicit org filter is needed or wanted here.
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .abortSignal(signal);

  if (error) {
    // Rule 9: non-2xx / transport failure is an ERROR, never "no data yet".
    return fromError(error.message);
  }
  if (count === null) {
    // No error but no count either — treat as a failure, not as empty.
    return fromError("The server returned no count.");
  }
  return fromCount(count);
}

export type WorkspaceCounts = {
  briefings: SectionData;
  documents: SectionData;
  /** Re-runs both fetches (both sections return to loading first). */
  retry: () => void;
};

export function useWorkspaceCounts(): WorkspaceCounts {
  const [briefings, setBriefings] = useState<SectionData>(LOADING);
  const [documents, setDocuments] = useState<SectionData>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    setBriefings(LOADING);
    setDocuments(LOADING);

    // The two fetches land independently so a briefings failure cannot mask
    // a healthy documents section (or vice versa).
    fetchCount("briefings", signal).then((data) => {
      if (!signal.aborted) setBriefings(data);
    });
    fetchCount("documents", signal).then((data) => {
      if (!signal.aborted) setDocuments(data);
    });

    // Rule 9: abort in-flight requests on unmount (and on retry) so a stale
    // response can never race a newer one into the UI.
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { briefings, documents, retry };
}
