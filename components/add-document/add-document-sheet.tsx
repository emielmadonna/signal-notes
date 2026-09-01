"use client";

// ADD DOCUMENT sheet (DESIGN-SPEC §3, canvas isPasteSheet) — every ingestion
// path the canvas promises: drop/browse a file, paste raw text, or fetch a
// web page. Values lifted from the canvas renderVals(): sheetDrop, kind
// pills, titleFieldStyle + missing-title guidance, pasteBox with live mono
// char count, primary(35) Save.
//
// Constitution rules in play:
//   R2  every client select/insert names its columns.
//   R3  every write's { error } (document AND audit line) is surfaced
//       inline; API failures render the server's human message, never
//       empty success.
//   R9  the API fetches and client DB calls abort on unmount.
//   R10 Save → "Saving…", Fetch → "Fetching…", uploads show their state.
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveOrgId } from "@/lib/org";
import { internalError } from "@/lib/errors";
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_SUMMARY,
} from "@/lib/ingest/file-types";
import { sanitizeDocumentText } from "@/lib/ingest/sanitize";
import type { WorkspaceDocument } from "@/lib/workspace-data";
import { Sheet, SheetCloseButton } from "@/components/ui-sn/sheet";
import { FileIcon } from "@/components/ui-sn/file-icon";
import { MicroFaint, MicroLabel } from "@/components/ui-sn/micro";
import { GhostButton, LinkButton, PrimaryButton } from "@/components/ui-sn/buttons";
import { Toast } from "@/components/ui-sn/toast";
import { ErrorBox } from "@/components/ui-sn/state-block";
import {
  uploadDocumentFile,
  type DocumentKind,
} from "@/components/add-document/upload-client";

const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const SERIF = "var(--font-literata), Literata, Georgia, serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

// The six the canvas draws in the drop zone: the rich formats plus WEB. The
// full accepted set is much wider now (lib/ingest/file-types.ts) and is stated
// in words under the icons rather than drawn as fourteen glyphs.
const FILE_TYPES = ["PDF", "DOCX", "TXT", "MD", "RTF", "WEB"] as const;

const KIND_OPTIONS: { label: string; value: DocumentKind }[] = [
  { label: "Interview notes", value: "interview_notes" },
  { label: "Call transcript", value: "call_transcript" },
  { label: "Web copy", value: "web_copy" },
  { label: "Other", value: "other" },
];

/** A pasted clipboard that is exactly one http(s) address. */
function asLoneUrl(text: string): string | null {
  const trimmed = text.trim();
  return /^https?:\/\/\S+$/.test(trimmed) ? trimmed : null;
}

// Canvas titleFieldStyle / titleFieldPlain: serif 17px over a 1px underline
// that turns danger in the missing-title state.
function underlineField(missing: boolean): CSSProperties {
  return {
    width: "100%",
    border: 0,
    borderBottom: `1px solid ${missing ? "var(--sn-danger)" : "var(--sn-border)"}`,
    borderRadius: 0,
    padding: "8px 0",
    fontFamily: SERIF,
    fontSize: 17,
    color: "var(--sn-text)",
    background: "transparent",
    outline: "none",
  };
}

export function AddDocumentSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  /** Called with the inserted row once ingestion fully succeeds (the
   *  optimistic seam — the dispatcher wires it to addDocumentToList). */
  onSaved: (doc: WorkspaceDocument) => void;
}) {
  const [title, setTitle] = useState("");
  const [titleMissing, setTitleMissing] = useState(false);
  const [kind, setKind] = useState<DocumentKind>("interview_notes");
  const [text, setText] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // R9: one controller for everything in flight; aborted on unmount so no
  // stale response (or late insert) ever lands after the sheet is gone.
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => {
      controller.abort();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const busy = saving || fetching || uploadingName !== null;

  /** Shared success tail: toast "<name> added", short beat, then hand the
   *  row to the caller (who navigates home). A failed audit line arrives as
   *  `warning`: the document IS saved, so we say so, surface the warning,
   *  and leave the user in control instead of auto-navigating. */
  function finishAdded(doc: WorkspaceDocument, label: string, warning: string | null) {
    setToast(`${label} added`);
    if (warning) {
      setError(warning);
      return;
    }
    timerRef.current = setTimeout(() => onSaved(doc), 900);
  }

  // -------------------------------------------------------------------------
  // PASTE path: client-side inserts (documents + audit line), RLS enforced.
  // -------------------------------------------------------------------------
  async function saveText() {
    if (busy) return;
    if (title.trim() === "") {
      setTitleMissing(true);
      return;
    }
    if (text.trim() === "") {
      setError("Paste some text first — an empty document gives a briefing nothing to read.");
      return;
    }
    setError(null);
    setSaving(true);
    const signal = abortRef.current?.signal;
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Your session has expired. Sign in again, then retry — nothing was saved.");
        return;
      }

      // The user's org — the same deterministic lookup the server routes use
      // (lib/org.ts), instead of a fourth copy of an unordered limit(1).
      const org = await resolveOrgId(supabase, user.id, signal ? { signal } : undefined);
      if (org.error) {
        setError(org.error.message);
        return;
      }
      const orgId = org.orgId;

      // The same gate the two ingestion routes use: text pasted out of a PDF
      // viewer carries the very NULs and lone surrogates Postgres refuses,
      // which arrive as a 500 at the insert rather than as a validation error
      // (catch #23).
      const body = sanitizeDocumentText(text).trim();
      const sizeBytes = new TextEncoder().encode(body).length;

      const insertQuery = supabase
        .from("documents")
        .insert({
          org_id: orgId,
          title: title.trim(),
          kind,
          body,
          ext: "TXT",
          size_bytes: sizeBytes,
          added_by: user.id,
        })
        .select("id, title, kind, ext, file_name, size_bytes, created_at, added_by");
      const { data: doc, error: insertError } = await (signal
        ? insertQuery.abortSignal(signal)
        : insertQuery
      ).single();
      if (insertError || !doc) {
        setError(
          internalError(
            "Saving the document failed, so nothing was added. Try again.",
            "add-document: document insert failed",
            insertError ?? new Error("no row came back")
          )
        );
        return;
      }

      // The UPLOADED audit line; its { error } is surfaced too (R3).
      const actor = (user.email ?? "user").split("@")[0].toUpperCase();
      const auditQuery = supabase.from("audit_events").insert({
        org_id: orgId,
        document_id: doc.id,
        event: "UPLOADED",
        detail: `Pasted text · ${sizeBytes} bytes`,
        actor,
        actor_user_id: user.id,
      });
      const { error: auditError } = await (signal
        ? auditQuery.abortSignal(signal)
        : auditQuery);
      if (auditError) {
        setError(
          internalError(
            "The document was added, but writing its history line failed.",
            "add-document: audit insert failed",
            auditError
          )
        );
        return;
      }

      onSaved(doc as WorkspaceDocument);
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // FILE path: drop or browse → multipart POST → toast (canvas: drop →
  // upload → toast "<file> added").
  // -------------------------------------------------------------------------
  async function handleFile(file: File) {
    if (busy) return;
    setError(null);
    setToast(null);
    setUploadingName(file.name);
    const result = await uploadDocumentFile(file, {
      title: title.trim() !== "" ? title.trim() : undefined,
      kind,
      signal: abortRef.current?.signal,
    });
    setUploadingName(null);
    if (result.error !== null) {
      setError(result.error);
      return;
    }
    finishAdded(result.doc, file.name, result.warning);
  }

  function onBrowse(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // same file twice must re-fire
    if (file) void handleFile(file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  // -------------------------------------------------------------------------
  // WEB URL path
  // -------------------------------------------------------------------------
  async function fetchUrl() {
    if (busy || url.trim() === "") return;
    setError(null);
    setToast(null);
    setFetching(true);
    try {
      let res: Response;
      try {
        res = await fetch("/api/documents/fetch-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            title: title.trim() !== "" ? title.trim() : undefined,
            kind,
          }),
          signal: abortRef.current?.signal,
        });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("The connection dropped before the request went out. Nothing was saved — try again.");
        return;
      }
      let payload: { document?: WorkspaceDocument; warning?: string | null; error?: string } = {};
      try {
        payload = await res.json();
      } catch {
        // Non-JSON body: the status-based message below is the backstop (R3).
      }
      if (!res.ok || !payload.document) {
        setError(
          payload.error ?? `The fetch failed (server said ${res.status}). Nothing was saved.`
        );
        return;
      }
      finishAdded(
        payload.document,
        payload.document.file_name ?? url.trim(),
        payload.warning ?? null
      );
    } finally {
      setFetching(false);
    }
  }

  /** Pasting a lone http(s) URL into the paste box opens the URL field
   *  prefilled instead of dumping the address into the text. */
  function onPasteIntoText(event: ClipboardEvent<HTMLTextAreaElement>) {
    const loneUrl = asLoneUrl(event.clipboardData.getData("text"));
    if (loneUrl !== null && text.trim() === "") {
      event.preventDefault();
      setUrlOpen(true);
      setUrl(loneUrl);
    }
  }

  // -------------------------------------------------------------------------
  // Render (canvas: padding 24px clamp(20px,3vw,30px) 28px)
  // -------------------------------------------------------------------------
  return (
    <Sheet variant="default" onClose={onClose} aria-label="Add a document">
      <style>{`.sn-add-field::placeholder{color:var(--sn-faint);opacity:1}`}</style>
      <div style={{ padding: "24px clamp(20px,3vw,30px) 28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(20px,2.4vw,24px)",
              fontWeight: 400,
              margin: 0,
              color: "var(--sn-text)",
            }}
          >
            Add a document
          </h1>
          <SheetCloseButton onClose={onClose} />
        </div>

        {/* Drop zone (canvas sheetDrop): 6 type icons + browse. */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => {
            if (!busy) fileInputRef.current?.click();
          }}
          role="button"
          aria-label="Drop a file here, or browse"
          style={{
            border: `1px dashed ${dragging ? "var(--sn-accent)" : "var(--sn-border)"}`,
            borderRadius: 14,
            padding: "22px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 16,
            cursor: busy ? "default" : "pointer",
            // Canvas dragging bg is #191815 dark / #F5F1E6 light; a 5% accent
            // wash over the sheet token lands on the same warm lift per theme.
            background: dragging
              ? "color-mix(in srgb, var(--sn-accent) 5%, var(--sn-sheet))"
              : "transparent",
            transition: "border-color .24s ease, background .24s ease",
          }}
        >
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {FILE_TYPES.map((ext) => (
              <FileIcon key={ext} ext={ext} size="sm" />
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            {uploadingName !== null ? (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: ".08em",
                  color: "var(--sn-accent)",
                }}
                aria-live="polite"
              >
                UPLOADING {uploadingName.toUpperCase()}…
              </div>
            ) : (
              <div style={{ fontSize: 13.5, fontWeight: 500, fontFamily: SANS }}>
                Drop a file here, or{" "}
                <span style={{ textDecoration: "underline" }}>browse</span>
              </div>
            )}
            <MicroFaint style={{ display: "block", marginTop: 6 }}>
              {ACCEPTED_SUMMARY} · WEB URL · UP TO 20 MB
            </MicroFaint>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={onBrowse}
            disabled={busy}
            style={{ display: "none" }}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>

        {/* TITLE */}
        <MicroLabel style={{ display: "block", marginTop: 20 }}>Title</MicroLabel>
        <input
          className="sn-add-field"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (titleMissing && event.target.value.trim() !== "") {
              setTitleMissing(false);
            }
          }}
          placeholder="Give this document a title"
          aria-invalid={titleMissing || undefined}
          style={underlineField(titleMissing)}
        />
        {titleMissing ? (
          <div
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
                color: "var(--sn-danger)",
                fontWeight: 400,
                fontSize: 12.5,
                fontFamily: SANS,
              }}
            >
              A title is how you&apos;ll find this later. Even &quot;Acme call,
              Aug 12&quot; is enough.
            </div>
          </div>
        ) : null}

        {/* KIND segmented pills */}
        <MicroLabel style={{ display: "block", margin: "18px 0 9px" }}>
          Kind
        </MicroLabel>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {KIND_OPTIONS.map((option) => {
            const selected = kind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                aria-pressed={selected}
                style={{
                  height: 29,
                  padding: "0 14px",
                  borderRadius: 100,
                  border: `1px solid ${selected ? "var(--sn-accent)" : "var(--sn-border)"}`,
                  background: "transparent",
                  color: selected ? "var(--sn-accent)" : "var(--sn-muted)",
                  fontFamily: SANS,
                  fontSize: 12,
                  fontWeight: 400,
                  cursor: "pointer",
                  transition: "all .16s",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {/* WEB URL mini-field — appears on demand, in canvas language:
            micro label + underline field + ghost Fetch with working state. */}
        {urlOpen ? (
          <div style={{ animation: "sn-line .2s ease both" }}>
            <MicroLabel style={{ display: "block", marginTop: 18 }}>
              Web URL
            </MicroLabel>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <input
                className="sn-add-field"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                inputMode="url"
                style={{
                  ...underlineField(false),
                  flex: 1,
                  fontFamily: SANS,
                  fontSize: 13.5,
                }}
              />
              <GhostButton
                size="sm"
                type="button"
                onClick={() => void fetchUrl()}
                working={fetching}
                workingLabel="Fetching…"
                disabled={url.trim() === "" || busy}
                style={{ flex: "none" }}
              >
                Fetch
              </GhostButton>
            </div>
          </div>
        ) : null}

        {/* TEXT paste box with live mono char count */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            margin: "18px 0 8px",
          }}
        >
          <MicroLabel>Text</MicroLabel>
          <MicroFaint>
            {text.length.toLocaleString("en-US")} characters
          </MicroFaint>
        </div>
        <textarea
          className="sn-add-field"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={onPasteIntoText}
          placeholder="Paste interview notes, a call transcript, or web copy…"
          style={{
            width: "100%",
            minHeight: 180,
            resize: "vertical",
            border: "1px solid var(--sn-soft)",
            borderRadius: 12,
            padding: "14px 16px",
            background: "var(--sn-input-bg)",
            fontFamily: SERIF,
            fontSize: 14,
            lineHeight: 1.75,
            color: "var(--sn-text)",
            outline: "none",
            display: "block",
          }}
        />

        {/* Inline failure surface (R3): the server's human message, or the
            client insert's { error }. Never silent, never fake-success. */}
        {error !== null ? (
          <ErrorBox
            title="That didn't go through."
            body={error}
            style={{ marginTop: 16, marginBottom: 0 }}
          />
        ) : null}
        {toast !== null ? <Toast>{toast}</Toast> : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 18,
            flexWrap: "wrap",
          }}
        >
          <PrimaryButton
            type="button"
            onClick={() => void saveText()}
            working={saving}
            workingLabel="Saving…"
            style={{ height: 35 }} // canvas saveStyle: primary(35)
          >
            Save document
          </PrimaryButton>
          {!urlOpen ? (
            <LinkButton type="button" onClick={() => setUrlOpen(true)}>
              Fetch a web page
            </LinkButton>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
