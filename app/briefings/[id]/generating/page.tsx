"use client";

// /briefings/[id]/generating — the GENERATION surface route (card-011).
// Renders the signature live-generation sheet over the app background; closing
// returns to the workspace. This is where BOTH a freshly-created run (the
// composer navigates here after POSTing) and a reopened GENERATING/FAILED
// briefing card land — the surface resumes the run identically by replaying +
// tailing /api/briefings/[id]/events (rule 8's "the run keeps going").
//
// A cross-org / deleted / mistyped id renders the canvas NOT FOUND sheet, not
// an error dump (R1) — the surface's RLS-scoped metadata read is the wall.
import { use } from "react";
import { GenerationSurface } from "@/components/generation/generation-surface";

export default function GeneratingPage({
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
      {/* Keyed by id so navigating between runs remounts the stream cleanly
          (its abort-on-unmount fires; the new id replays from scratch) (R9). */}
      <GenerationSurface key={id} id={id} />
    </div>
  );
}
