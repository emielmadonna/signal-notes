"use client";

// Client seam for the file-upload ingestion path (card-008). Both the
// Add-a-document sheet and the workspace DropZone push files through here:
// one multipart POST to /api/documents/upload, one honest result shape.
//
// Constitution rules in play:
//   R3  a non-2xx (or unparsable) response ALWAYS becomes a human-readable
//       error string for the caller to surface — never an empty success.
//   R9  callers pass an AbortSignal so an in-flight upload dies with the
//       component that started it.
import type { WorkspaceDocument } from "@/lib/workspace-data";

export type DocumentKind =
  | "interview_notes"
  | "call_transcript"
  | "web_copy"
  | "other";

export type UploadResult =
  | {
      doc: WorkspaceDocument;
      /** Non-null when the document saved but its audit line did not (the
       *  server owns that wording); callers must still show it. */
      warning: string | null;
      error: null;
    }
  | { doc: null; warning: null; error: string };

/** Pulls the server's human message out of a response, with honest fallbacks. */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim() !== "") {
      return payload.error;
    }
  } catch {
    // Body was not JSON (proxy page, empty body). Fall through to the
    // status-based message below — the status line is the backstop.
  }
  return `The upload failed (server said ${res.status}). Nothing was saved.`;
}

export async function uploadDocumentFile(
  file: File,
  options: { title?: string; kind?: DocumentKind; signal?: AbortSignal } = {}
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  if (options.title !== undefined) form.append("title", options.title);
  if (options.kind !== undefined) form.append("kind", options.kind);

  let res: Response;
  try {
    res = await fetch("/api/documents/upload", {
      method: "POST",
      body: form,
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      // Unmounted mid-flight (R9): the caller is gone; report quietly.
      return { doc: null, warning: null, error: "The upload was cancelled." };
    }
    return {
      doc: null,
      warning: null,
      error: "The connection dropped before the file reached us. Nothing was saved — try again.",
    };
  }

  if (!res.ok) {
    return { doc: null, warning: null, error: await readErrorMessage(res) };
  }

  try {
    const payload = (await res.json()) as {
      document?: WorkspaceDocument;
      warning?: string | null;
    };
    if (!payload.document) {
      return {
        doc: null,
        warning: null,
        error: "The server answered without the saved document. Check the list before retrying.",
      };
    }
    return {
      doc: payload.document,
      warning:
        typeof payload.warning === "string" && payload.warning !== ""
          ? payload.warning
          : null,
      error: null,
    };
  } catch {
    return {
      doc: null,
      warning: null,
      error: "The server's answer couldn't be read. Check the list before retrying.",
    };
  }
}
