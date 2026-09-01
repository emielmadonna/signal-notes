"use client";

// /compose — the COMPOSER sheet on its own route (card-011). Renders the
// default-width (740) sheet over the app background; closing (scrim click,
// Escape, ✕) returns to the workspace at "/". The selection the user arrived
// with is handed over in the URL as ?docs=id,id (the workspace's Generate
// entry points pass it — the same cross-route pattern the document sheet uses
// with ?use=), and preselects those pick tiles.
//
// Generate POSTs to /api/briefings/generate and navigates to the generation
// surface for the new briefing id; everything real happens client-side in
// components/compose through the RLS-scoped workspace data layer.
import { use } from "react";
import { Composer } from "@/components/compose/composer";

export default function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ docs?: string }>;
}) {
  const { docs } = use(searchParams);
  const preselectedIds = (docs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return (
    <main
      style={{
        minHeight: "100dvh",
        minWidth: 360,
        background: "var(--sn-bg)",
        color: "var(--sn-text)",
      }}
    >
      <Composer preselectedIds={preselectedIds} />
    </main>
  );
}
