"use client";

// THE CITATION TOOLTIP (card-012) — DESIGN-SPEC §3 BRIEFING, values from the
// canvas tipStyle block: fixed-positioned, flips below the marker when it sits
// near the top of the viewport, file icon + mono passage label + the EXACT
// serif quote + the file name. This is rule 6 made literal — the passage is
// server-verified at generation, so what the reader sees here is the ground
// truth the sentence rests on.
//
// It stays open while the pointer is inside it (onHold/onRelease from the
// parent cancel/arm the close timer) so a reader can select the quote text.
import type { CSSProperties } from "react";
import { FileIcon, type FileExt } from "@/components/ui-sn/file-icon";
import { MicroFaint } from "@/components/ui-sn/micro";

const SERIF = "var(--font-literata), Literata, Georgia, serif";

export type CitationTip = {
  /** Source document extension (for the file glyph). */
  ext: string;
  /** Source document file name / title. */
  fileName: string;
  /** Mono passage label — the citation's stored label. */
  passageLabel: string;
  /** The exact, server-verified quote (serif). */
  quote: string;
  /** Fixed-position anchor: clamped centre x, and the marker's top/bottom y. */
  x: number;
  y: number;
  /** When > 0, render BELOW the marker at this y (near the viewport top). */
  below: number;
};

export function CitationTooltip({
  tip,
  onHold,
  onRelease,
}: {
  tip: CitationTip;
  onHold: () => void;
  onRelease: () => void;
}) {
  const style: CSSProperties = {
    position: "fixed",
    left: tip.x,
    top: tip.below ? tip.below : tip.y,
    transform: `translate(-50%, ${tip.below ? "12px" : "calc(-100% - 12px)"})`,
    width: "min(320px,84vw)",
    maxHeight: "min(300px,50vh)",
    overflow: "auto",
    background: "var(--sn-tip)",
    border: "1px solid var(--sn-border)",
    borderRadius: 12,
    padding: "12px 14px",
    boxShadow: "0 18px 34px -18px rgba(0,0,0,.8)",
    zIndex: 80,
    animation: "sn-fade .18s cubic-bezier(.32,.72,0,1) both",
    color: "var(--sn-text)",
  };
  return (
    <div role="tooltip" onMouseEnter={onHold} onMouseLeave={onRelease} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FileIcon ext={tip.ext as FileExt} size="sm" />
        <MicroFaint>{tip.passageLabel}</MicroFaint>
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 13.5,
          lineHeight: 1.6,
          marginTop: 9,
          color: "var(--sn-text)",
        }}
      >
        {tip.quote}
      </div>
      <MicroFaint style={{ display: "block", marginTop: 8 }}>
        {tip.fileName}
      </MicroFaint>
    </div>
  );
}
