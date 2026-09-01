"use client";

// /briefings/[id] — the BRIEFING reading view route (card-012). Renders the
// finished briefing as the signature paper card (Sheet variant "brief") over
// the app background; closing returns to the workspace.
//
// Everything real happens client-side in components/briefing-view through
// RLS-scoped queries (rule 1): a cross-org / deleted / mistyped id yields zero
// rows and renders the canvas NOT FOUND sheet — never an error dump. A briefing
// that is still generating or has failed is not a reading-view case; the view
// redirects it to /briefings/[id]/generating (builder-11's live surface).
import { use } from "react";
import { BriefingView } from "@/components/briefing-view/briefing-view";

export default function BriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
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
      {/* Keyed by id so navigating between briefings remounts the view: its
          abort-on-unmount fires and the new id loads from scratch (R9). */}
      <BriefingView key={id} id={id} />
    </div>
  );
}
