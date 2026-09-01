"use client";

// DropZone — the "DRAG FILES ANYWHERE HERE" wrapper around the documents
// grid (DESIGN-SPEC §3 DOCUMENT TILE drop behavior; canvas dropZone /
// dropOverlay / toastStyle). Self-contained: wraps its children, shows the
// dashed accent outline + "Drop to add to <org>" overlay while dragging,
// uploads the dropped file through /api/documents/upload, renders its own
// "<file> added" toast (sn-rise) and its own inline error line. NOT mounted
// anywhere by card-008 — the dispatcher mounts it in the workspace.
//
// Constitution rules in play:
//   R3  the upload's failure message is rendered inline, never swallowed;
//       a non-2xx never looks like success.
//   R9  the in-flight upload aborts on unmount.
//   R10 the drop shows a live "UPLOADING …" line while the request runs.
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { UploadIcon } from "@/components/ui-sn/icons";
import { MicroFaint } from "@/components/ui-sn/micro";
import { Toast } from "@/components/ui-sn/toast";
import type { WorkspaceDocument } from "@/lib/workspace-data";
import { uploadDocumentFile } from "@/components/add-document/upload-client";

const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

export function DropZone({
  orgName,
  onAdded,
  disabled = false,
  children,
}: {
  orgName: string;
  /** Optimistic seam: receives the inserted row (feed addDocumentToList). */
  onAdded: (doc: WorkspaceDocument) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // dragenter/dragleave fire for every child the cursor crosses; the depth
  // counter keeps the overlay steady until the drag truly leaves the zone.
  const depthRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => {
      // R9: kill the in-flight upload (and the toast timer) with the zone.
      controller.abort();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function hasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function onDragEnter(event: DragEvent) {
    if (disabled || !hasFiles(event)) return;
    event.preventDefault();
    depthRef.current += 1;
    if (!dragging) setDragging(true);
  }

  function onDragOver(event: DragEvent) {
    if (disabled || !hasFiles(event)) return;
    event.preventDefault(); // required, or the browser opens the file
  }

  function onDragLeave(event: DragEvent) {
    if (disabled || !hasFiles(event)) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setDragging(false);
  }

  async function onDrop(event: DragEvent) {
    if (disabled || !hasFiles(event)) return;
    event.preventDefault();
    depthRef.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || uploadingName !== null) return;

    setError(null);
    setToast(null);
    setUploadingName(file.name);
    // No title travels with a drop: the server falls back to the filename
    // stem; kind starts as "other" until the user edits the document.
    const result = await uploadDocumentFile(file, {
      kind: "other",
      signal: abortRef.current?.signal,
    });
    setUploadingName(null);

    if (result.error !== null) {
      // R3: the server's human message, rendered right under the grid.
      setError(result.error);
      return;
    }
    onAdded(result.doc);
    if (result.warning !== null) setError(result.warning);
    setToast(`${file.name} added`);
    timerRef.current = setTimeout(() => setToast(null), 2600); // canvas beat
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      // Canvas dropZone: relative, 10px breathing room + 2px dashed accent
      // outline (offset 6) only while dragging.
      style={{
        position: "relative",
        padding: dragging ? 10 : 0,
        borderRadius: 16,
        outline: dragging ? "2px dashed var(--sn-accent)" : "0",
        outlineOffset: 6,
        transition: "outline-color .18s",
      }}
    >
      {children}

      {dragging ? (
        <div
          // Canvas dropOverlay: near-opaque app-bg wash over the grid
          // (rgba(15,15,14,.86) dark / rgba(240,236,226,.9) light — the
          // 88% bg mix reproduces both from the theme token).
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 16,
            background: "color-mix(in srgb, var(--sn-bg) 88%, transparent)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            animation: "sn-fade .15s ease both",
            zIndex: 6,
          }}
        >
          <UploadIcon size={26} color="var(--sn-muted)" />
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              marginTop: 8,
              fontFamily: SANS,
              color: "var(--sn-text)",
            }}
          >
            Drop to add to {orgName}
          </span>
          <MicroFaint style={{ marginTop: 4 }}>
            PDF · DOCX · TXT · MD · RTF
          </MicroFaint>
        </div>
      ) : null}

      {uploadingName !== null ? (
        <div
          aria-live="polite"
          style={{
            marginTop: 14,
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: ".08em",
            color: "var(--sn-accent)",
          }}
        >
          UPLOADING {uploadingName.toUpperCase()}…
        </div>
      ) : null}

      {error !== null ? (
        <div
          role="alert"
          style={{ display: "flex", gap: 10, marginTop: 14, maxWidth: "70ch" }}
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
              fontSize: 12.5,
              fontFamily: SANS,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        </div>
      ) : null}

      {toast !== null ? <Toast>{toast}</Toast> : null}
    </div>
  );
}
