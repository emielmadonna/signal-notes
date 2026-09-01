"use client";

// /documents/[id] — the DOCUMENT sheet route (P3 card-009). The sheet
// renders over the app background; closing it (scrim click, Escape, the
// close button, or Back to briefings on the not-found variant) returns to
// the workspace. ?edit=1 (the selection bar's Rename) opens the sheet with
// the title already in its inline-edit state.
//
// Everything real happens client-side in components/document-sheet through
// RLS-scoped queries: a cross-org id yields zero rows and renders the
// canvas NOT FOUND sheet — never an error dump (R1).
import { use } from "react";
import { DocumentSheet } from "@/components/document-sheet/document-sheet";

export default function DocumentSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = use(params);
  const { edit } = use(searchParams);
  return (
    <div
      style={{
        minHeight: "100dvh",
        minWidth: 360,
        background: "var(--sn-bg)",
        color: "var(--sn-text)",
        transition: "background .25s,color .25s",
      }}
    >
      {/* Keyed by id: navigating between documents remounts the sheet, so
          its loading/edit state can never leak from one document to the
          next (R9). */}
      <DocumentSheet key={id} id={id} initialEdit={edit === "1"} />
    </div>
  );
}
