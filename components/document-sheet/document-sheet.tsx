"use client";

// THE DOCUMENT SHEET (P3 card-009) — DESIGN-SPEC §3 SHEETS/DOCUMENT, every
// value from the canvas renderVals() (docSheet block, renameInput,
// docBodyStyle, editStyle, usedRow, historyRow, docMeta) rendering a REAL
// row: big file icon, filename, serif title with inline edit
// (Edit→Save→"Saving…"→SAVED), mono meta, the document's actual text, a
// right rail with the briefings that used it (real reverse query) and its
// append-only FILE HISTORY (real audit_events).
//
// Constitution rules in play:
//   R1  no org filter anywhere — RLS scopes every query; a cross-org id
//       yields zero rows and renders the canvas NOT FOUND sheet (this
//       component IS tenant isolation's UX face), never an error dump.
//   R2  named columns on every select, including embedded resources.
//   R3  every write's { error } is surfaced inline (rename, body edit, and
//       the TITLE EDITED audit line each report their own failure).
//   R9  fetches abort on unmount; error ≠ empty ≠ not-found ≠ loading.
//   R10 Save shows "Saving…", the sheet renders the new title/body
//       optimistically, and the workspace tile picks the rename up through
//       recordDocumentPatch → updateDocumentInList without a refetch.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { LinkButton, PrimaryButton } from "@/components/ui-sn/buttons";
import { FileIcon } from "@/components/ui-sn/file-icon";
import { EditIcon, SparkIcon } from "@/components/ui-sn/icons";
import { MicroAccent, MicroFaint, MicroLabel } from "@/components/ui-sn/micro";
import { Sheet, SheetCloseButton } from "@/components/ui-sn/sheet";
import { ErrorBox } from "@/components/ui-sn/state-block";
import {
  auditTitleEdit,
  recordDocumentPatch,
  renameDocument,
  updateDocumentBody,
  type DocumentAuditRow,
} from "@/lib/document-actions";
import { briefingDate, docDate, humanSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

// ---------------------------------------------------------------------------
// Row shapes (exactly the named columns this sheet reads)
// ---------------------------------------------------------------------------

type SheetDocument = {
  id: string;
  org_id: string;
  title: string;
  kind: string;
  ext: string;
  file_name: string | null;
  size_bytes: number;
  body: string;
  created_at: string;
};

type UsedInBriefing = {
  id: string;
  title: string | null;
  created_at: string;
  status: string;
};

// The raw nested shape for the reverse briefing_sources query (embedded
// to-one relations may arrive as an object or a 1-element array).
type RawSourceRow = {
  briefing_id: string;
  briefings: UsedInBriefing | UsedInBriefing[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

// Error ≠ empty ≠ loading ≠ not-found, always (R9).
type DocState =
  | { state: "loading" }
  | { state: "error"; detail: string }
  | { state: "notfound" }
  | { state: "ready" };

type RailState<Row> =
  | { state: "loading" }
  | { state: "error"; detail: string }
  | { state: "populated"; rows: Row[] };

// 'interview_notes' → "INTERVIEW NOTES" (canvas docMeta: kind uppercased).
function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ").toUpperCase();
}

// ---------------------------------------------------------------------------
// Canvas styles (docBodyStyle / renameInput / editStyle / usedRow /
// historyRow), token-routed.
// ---------------------------------------------------------------------------

function docBodyStyle(editing: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 280,
    fontFamily: SERIF,
    fontSize: 15,
    lineHeight: 1.8,
    color: "var(--sn-muted)",
    maxWidth: "66ch",
    ...(editing
      ? {
          border: "1px solid var(--sn-accent)",
          borderRadius: 12,
          padding: "16px 18px",
        }
      : null),
  };
}

const renameInputStyle: CSSProperties = {
  fontFamily: SERIF,
  fontSize: "clamp(20px,2.4vw,24px)",
  fontWeight: 400,
  margin: "8px 0 0",
  width: "100%",
  background: "transparent",
  color: "var(--sn-text)",
  border: 0,
  borderBottom: "1px solid var(--sn-accent)",
  outline: 0,
  padding: "2px 0",
};

const usedRowStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: 0,
  background: "transparent",
  padding: "12px 0",
  borderBottom: "1px solid var(--sn-soft)",
  cursor: "pointer",
  color: "var(--sn-text)",
};

const historyRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "6px 0",
  fontFamily: MONO,
  fontSize: 9.5,
  color: "var(--sn-muted)",
};

const quietLineStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--sn-faint)",
  padding: "12px 0",
};

// Inline danger line (canvas errRule pattern) for surfaced write failures.
function InlineError({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      role="alert"
      style={{ display: "flex", gap: 10, animation: "sn-line .2s ease both" }}
    >
      <div
        style={{
          width: 2,
          background: "var(--sn-danger)",
          flex: "none",
          borderRadius: 2,
        }}
      />
      <div>
        <div
          style={{ fontSize: 12.5, fontWeight: 500, color: "var(--sn-danger)" }}
        >
          {title}
        </div>
        {detail ? (
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--sn-muted)",
              marginTop: 3,
            }}
          >
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Rail error: a small danger line + retry (error, never blank — R9).
function RailError({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: "10px 0" }}>
      <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--sn-danger)" }}>
        Couldn&apos;t load this. {detail}
      </div>
      <LinkButton type="button" onClick={onRetry} style={{ padding: 0, marginTop: 4 }}>
        Try again
      </LinkButton>
    </div>
  );
}

// Modest loading skeleton inside the doc-width sheet, reusing the skeleton
// style vocabulary (--sn-skel-* tokens + the accent sweep).
function DocSheetSkeleton() {
  const bar = (extra: CSSProperties): CSSProperties => ({
    borderRadius: 3,
    background: "var(--sn-skel-bar2)",
    ...extra,
  });
  return (
    <div
      aria-hidden="true"
      style={{
        padding: "24px clamp(20px,3vw,32px) 28px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 80,
          background:
            "linear-gradient(90deg,transparent,color-mix(in srgb, var(--sn-accent) 13.3%, transparent),transparent)",
          animation: "sn-sweep 1.5s linear infinite",
        }}
      />
      <div style={{ display: "flex", gap: 15, alignItems: "flex-start" }}>
        <div
          style={{
            width: 52,
            height: 66,
            borderRadius: 8,
            flex: "none",
            background:
              "linear-gradient(90deg,var(--sn-skel-icon-edge) 0%,var(--sn-skel-icon-mid) 50%,var(--sn-skel-icon-edge) 100%)",
            backgroundSize: "340px 100%",
            animation: "sn-shim 1.3s linear infinite",
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={bar({ height: 11, width: "34%", background: "var(--sn-skel-bar1)" })} />
          <div style={bar({ height: 15, width: "62%", marginTop: 14, background: "var(--sn-skel-bar1)" })} />
          <div style={bar({ height: 8, width: "40%", marginTop: 12 })} />
        </div>
      </div>
      <div style={{ marginTop: 30, maxWidth: "66ch" }}>
        <div style={bar({ height: 10, width: "96%" })} />
        <div style={bar({ height: 10, width: "88%", marginTop: 12 })} />
        <div style={bar({ height: 10, width: "92%", marginTop: 12 })} />
        <div style={bar({ height: 10, width: "58%", marginTop: 12 })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

export function DocumentSheet({
  id,
  initialEdit = false,
}: {
  id: string;
  /** True when opened from the selection bar's Rename (?edit=1). */
  initialEdit?: boolean;
}) {
  const router = useRouter();
  const close = useCallback(() => router.push("/"), [router]);

  const [docState, setDocState] = useState<DocState>({ state: "loading" });
  const [doc, setDoc] = useState<SheetDocument | null>(null);
  const [usedIn, setUsedIn] = useState<RailState<UsedInBriefing>>({
    state: "loading",
  });
  const [history, setHistory] = useState<RailState<DocumentAuditRow>>({
    state: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  // Retry returns every section to an honest loading state (R9: loading ≠
  // stale content) and re-runs the fetch effect. The initial states are
  // already "loading", and the page remounts this component per id (key),
  // so the effect itself never needs to set state synchronously.
  const retry = useCallback(() => {
    setDocState({ state: "loading" });
    setUsedIn({ state: "loading" });
    setHistory({ state: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  // Edit state (canvas: editing / saving / docSaved + the drafts).
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [titleMissing, setTitleMissing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  // ?edit=1 opens edit mode once, the moment the document arrives.
  const autoEditPending = useRef(initialEdit);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const supabase = createClient();

    // The document itself. RLS is the only org wall (R1): a cross-org id
    // matches zero rows → maybeSingle() returns null → NOT FOUND, exactly
    // like a deleted document. A malformed id in the URL ("wrong link",
    // postgres 22P02) is not-found too — retrying can never fix it — while
    // every other failure is an honest, retryable ERROR (R9).
    supabase
      .from("documents")
      .select(
        "id, org_id, title, kind, ext, file_name, size_bytes, body, created_at"
      )
      .eq("id", id)
      .abortSignal(signal)
      .maybeSingle<SheetDocument>()
      .then(({ data, error }) => {
        if (signal.aborted) return;
        if (error) {
          if (error.code === "22P02") setDocState({ state: "notfound" });
          else setDocState({ state: "error", detail: error.message });
          return;
        }
        if (data === null) {
          setDocState({ state: "notfound" });
          return;
        }
        setDoc(data);
        setDocState({ state: "ready" });
        if (autoEditPending.current) {
          autoEditPending.current = false;
          setDraftTitle(data.title);
          setDraftBody(data.body);
          setEditing(true);
        }
      });

    // USED IN N BRIEFINGS — the real reverse query (R2: every embedded
    // column named).
    supabase
      .from("briefing_sources")
      .select("briefing_id, briefings (id, title, created_at, status)")
      .eq("document_id", id)
      .abortSignal(signal)
      .then(({ data, error }) => {
        if (signal.aborted) return;
        if (error) {
          setUsedIn({ state: "error", detail: error.message });
          return;
        }
        const rows = ((data ?? []) as unknown as RawSourceRow[])
          .map((row) => one(row.briefings))
          .filter((b): b is UsedInBriefing => b !== null)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        setUsedIn({ state: "populated", rows });
      });

    // FILE HISTORY — the document's append-only audit trail, oldest first.
    supabase
      .from("audit_events")
      .select("event, detail, actor, created_at")
      .eq("document_id", id)
      .order("created_at", { ascending: true })
      .abortSignal(signal)
      .then(({ data, error }) => {
        if (signal.aborted) return;
        if (error) {
          setHistory({ state: "error", detail: error.message });
          return;
        }
        setHistory({
          state: "populated",
          rows: (data ?? []) as DocumentAuditRow[],
        });
      });

    // R9: abort all three on unmount/retry so a stale response can never
    // race a newer one into the sheet.
    return () => controller.abort();
  }, [id, attempt]);

  // --- Edit → Save ------------------------------------------------------
  const startEdit = useCallback(() => {
    if (!doc) return;
    setDraftTitle(doc.title);
    setDraftBody(doc.body);
    setSaved(false);
    setSaveError(null);
    setTitleMissing(false);
    setEditing(true);
  }, [doc]);

  const save = useCallback(async () => {
    if (!doc || saving) return;
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      // Same guidance the add-document sheet gives a missing title.
      setTitleMissing(true);
      return;
    }
    setTitleMissing(false);
    setSaveError(null);
    setSaving(true);

    const titleChanged = nextTitle !== doc.title;
    const bodyChanged = draftBody !== doc.body;
    const oldTitle = doc.title;

    // R3: each write's { error } is checked and surfaced inline, in order.
    if (titleChanged) {
      const { error } = await renameDocument(doc.id, nextTitle);
      if (error) {
        setSaving(false);
        setSaveError(`The title wasn't saved. ${error}`);
        return; // stay in edit mode; nothing is pretended
      }
      // R10: optimistic local render + the workspace tile patch.
      setDoc((d) => (d ? { ...d, title: nextTitle } : d));
      recordDocumentPatch(doc.id, { title: nextTitle });
    }
    if (bodyChanged) {
      const { error } = await updateDocumentBody(doc.id, draftBody);
      if (error) {
        setSaving(false);
        setSaveError(`The text wasn't saved. ${error}`);
        return; // the title (if changed) is already honest above
      }
      setDoc((d) => (d ? { ...d, body: draftBody } : d));
    }

    // A rename leaves its audit line (DESIGN-SPEC §4); its failure is
    // surfaced too, without un-saving what already saved.
    let auditError: string | null = null;
    if (titleChanged) {
      const { error, row } = await auditTitleEdit(
        doc.id,
        doc.org_id,
        oldTitle,
        nextTitle
      );
      auditError = error;
      if (row) {
        // R10: the new history line appears without refetching the rail.
        setHistory((h) =>
          h.state === "populated" ? { state: "populated", rows: [...h.rows, row] } : h
        );
      }
    }

    setSaving(false);
    setEditing(false);
    if (auditError) {
      setSaveError(
        `The change was saved, but its history line wasn't recorded. ${auditError}`
      );
      setSaved(false);
    } else {
      setSaved(true);
    }
  }, [doc, saving, draftTitle, draftBody]);

  // ----------------------------------------------------------------------
  // NOT FOUND — the canvas 460px sheet. This is what a cross-org (or
  // deleted, or mistyped) id renders: no error dump, just a way back (R1).
  // ----------------------------------------------------------------------
  if (docState.state === "notfound") {
    return (
      <Sheet variant="narrow" onClose={close} aria-label="Page not found">
        <div style={{ padding: "30px 32px 32px" }}>
          <div style={{ fontFamily: SERIF, fontSize: 23 }}>
            This page doesn&apos;t exist.
          </div>
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.65,
              color: "var(--sn-muted)",
              margin: "9px 0 16px",
            }}
          >
            It may have been deleted, or the link may be wrong.
          </p>
          <PrimaryButton type="button" onClick={close}>
            Back to briefings
          </PrimaryButton>
        </div>
      </Sheet>
    );
  }

  if (docState.state === "loading") {
    return (
      <Sheet variant="doc" onClose={close} aria-label="Loading document">
        <DocSheetSkeleton />
      </Sheet>
    );
  }

  if (docState.state === "error" || doc === null) {
    return (
      <Sheet variant="doc" onClose={close} aria-label="Document unavailable">
        <div style={{ padding: "24px clamp(20px,3vw,32px) 28px" }}>
          <ErrorBox
            title="We couldn't load this document."
            body={
              docState.state === "error"
                ? `${docState.detail} Nothing has been lost.`
                : "Nothing has been lost."
            }
            onRetry={retry}
            style={{ marginBottom: 0 }}
          />
        </div>
      </Sheet>
    );
  }

  const paragraphs = doc.body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const usedCount = usedIn.state === "populated" ? usedIn.rows.length : null;

  return (
    <Sheet variant="doc" onClose={close} aria-label={doc.title}>
      <div style={{ padding: "24px clamp(20px,3vw,32px) 28px" }}>
        {/* Header: icon · filename · title (or rename input) · meta · actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 15, alignItems: "flex-start", flex: 1, minWidth: 260 }}>
            <FileIcon ext={doc.ext} size="md" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {doc.file_name ?? "Pasted text"}
              </div>
              {editing ? (
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  aria-label="Document title"
                  style={renameInputStyle}
                />
              ) : (
                <h1
                  style={{
                    fontFamily: SERIF,
                    fontSize: "clamp(20px,2.4vw,24px)",
                    fontWeight: 400,
                    margin: "8px 0 0",
                    color: "var(--sn-text)",
                  }}
                >
                  {doc.title}
                </h1>
              )}
              {titleMissing ? (
                <div
                  role="alert"
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 9,
                    animation: "sn-line .2s ease both",
                  }}
                >
                  <div
                    style={{
                      width: 2,
                      background: "var(--sn-danger)",
                      flex: "none",
                      borderRadius: 2,
                    }}
                  />
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--sn-danger)",
                      lineHeight: 1.5,
                    }}
                  >
                    A title is how you&apos;ll find this later. Even &quot;Acme
                    call, Aug 12&quot; is enough.
                  </div>
                </div>
              ) : null}
              <MicroLabel style={{ display: "block", marginTop: 9 }}>
                {kindLabel(doc.kind)} · {humanSize(doc.size_bytes)} · ADDED{" "}
                {docDate(doc.created_at)}
              </MicroLabel>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {saved ? <MicroAccent>SAVED</MicroAccent> : null}
            {/* Canvas editStyle: ghost pill that turns accent while editing;
                Edit → Save → "Saving…" (R10 working state). */}
            <button
              type="button"
              onClick={editing ? save : startEdit}
              disabled={saving}
              aria-busy={saving || undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 31,
                padding: "0 14px",
                borderRadius: 100,
                border: `1px solid ${editing ? "var(--sn-accent)" : "var(--sn-border)"}`,
                background: "transparent",
                color: editing ? "var(--sn-accent)" : "var(--sn-text)",
                fontFamily: SANS,
                fontSize: 12,
                fontWeight: 400,
                cursor: saving ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <EditIcon size={13} />
              {editing ? (saving ? "Saving…" : "Save") : "Edit"}
            </button>
            <PrimaryButton
              type="button"
              size="sm"
              onClick={() => router.push(`/?use=${doc.id}`)}
            >
              <SparkIcon size={14} />
              Use in briefing
            </PrimaryButton>
            <SheetCloseButton onClose={close} />
          </div>
        </div>

        {/* Surfaced write failure (R3) — visible in and out of edit mode. */}
        {saveError ? (
          <div style={{ marginTop: 14 }}>
            <InlineError title="That didn't save cleanly." detail={saveError} />
          </div>
        ) : null}

        {/* Body + right rail */}
        <div
          style={{
            display: "flex",
            gap: "clamp(20px,3vw,32px)",
            marginTop: 22,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          {editing ? (
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              aria-label="Document text"
              style={{
                ...docBodyStyle(true),
                width: "100%",
                minHeight: 320,
                background: "transparent",
                outline: 0,
                resize: "vertical",
              }}
            />
          ) : (
            <div style={docBodyStyle(false)}>
              {paragraphs.length === 0 ? (
                <p style={{ margin: 0, color: "var(--sn-faint)" }}>
                  This document has no text.
                </p>
              ) : (
                paragraphs.map((p, i) => (
                  <p
                    key={i}
                    style={{
                      margin: i === paragraphs.length - 1 ? 0 : "0 0 18px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {p}
                  </p>
                ))
              )}
            </div>
          )}

          {/* Right rail 230px: USED IN N BRIEFINGS + FILE HISTORY */}
          <div style={{ width: 230, flex: "none" }}>
            <MicroLabel>
              USED IN {usedCount ?? "…"}{" "}
              {usedCount === 1 ? "BRIEFING" : "BRIEFINGS"}
            </MicroLabel>
            {usedIn.state === "loading" ? (
              <MicroFaint style={{ display: "block", padding: "12px 0" }}>
                LOADING
              </MicroFaint>
            ) : usedIn.state === "error" ? (
              <RailError detail={usedIn.detail} onRetry={retry} />
            ) : usedIn.rows.length === 0 ? (
              <div style={quietLineStyle}>Not used in any briefing yet.</div>
            ) : (
              usedIn.rows.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => router.push(`/briefings/${b.id}`)}
                  style={usedRowStyle}
                >
                  <span
                    style={{
                      fontFamily: SERIF,
                      fontSize: 14.5,
                      lineHeight: 1.35,
                      display: "block",
                    }}
                  >
                    {b.title?.trim() ? b.title : "Untitled briefing"}
                  </span>
                  <MicroFaint style={{ display: "block", marginTop: 5 }}>
                    {docDate(b.created_at)} · {b.status.toUpperCase()}
                  </MicroFaint>
                </button>
              ))
            )}

            <MicroLabel style={{ display: "block", marginTop: 22 }}>
              FILE HISTORY
            </MicroLabel>
            {history.state === "loading" ? (
              <MicroFaint style={{ display: "block", padding: "12px 0" }}>
                LOADING
              </MicroFaint>
            ) : history.state === "error" ? (
              <RailError detail={history.detail} onRetry={retry} />
            ) : history.rows.length === 0 ? (
              <div style={quietLineStyle}>No history recorded yet.</div>
            ) : (
              history.rows.map((row, i) => (
                <div key={`${row.created_at}-${i}`} style={historyRowStyle}>
                  <span style={{ opacity: 0.65, flex: "none" }}>
                    {briefingDate(row.created_at)}
                  </span>
                  <span>{row.detail?.trim() ? row.detail : row.event}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
