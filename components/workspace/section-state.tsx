"use client";

// SectionState — one component renders the four states of a workspace
// section (populated | empty | loading | error) with the DESIGN-SPEC §3
// STATES copy, exactly. Error ≠ empty ≠ loading, always. The populated
// branch renders `children` (P3's real grids); until P3 lands it shows an
// honest one-line placeholder naming the real count, never fake content.
import type { CSSProperties, ReactNode } from "react";
import {
  BriefingCardSkeleton,
  DocTileSkeleton,
  EmptyBox,
  ErrorBox,
} from "@/components/ui-sn/state-block";
import { PrimaryButton } from "@/components/ui-sn/buttons";
import { PlusIcon, SparkIcon, UploadIcon } from "@/components/ui-sn/icons";
import type { SectionStateKind } from "@/lib/workspace-data";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

// Canvas grid values: briefings minmax(304px,1fr) gap clamp(14px,1.8vw,22px);
// documents minmax(134px,1fr) gap clamp(12px,1.6vw,20px).
const briefGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(304px,1fr))",
  gap: "clamp(14px,1.8vw,22px)",
  marginBottom: 42,
};
const docGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(134px,1fr))",
  gap: "clamp(12px,1.6vw,20px)",
  marginBottom: 42,
};

export function SectionState({
  section,
  state,
  count,
  onRetry,
  children,
}: {
  section: "briefings" | "documents";
  state: SectionStateKind;
  count?: number | null;
  onRetry: () => void;
  /** P3's populated content. Absent in P2 → honest placeholder line. */
  children?: ReactNode;
}) {
  if (state === "loading") {
    return section === "briefings" ? (
      <div style={briefGrid}>
        {[0, 1, 2, 3].map((i) => (
          <BriefingCardSkeleton key={i} />
        ))}
      </div>
    ) : (
      <div style={docGrid}>
        {[0, 1, 2, 3, 4].map((i) => (
          <DocTileSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return section === "briefings" ? (
      <ErrorBox
        title="We couldn't load your briefings."
        body="The connection dropped. Nothing has been lost."
        onRetry={onRetry}
      />
    ) : (
      <ErrorBox
        title="We couldn't load your documents."
        body="The request timed out. Nothing has been lost."
        onRetry={onRetry}
      />
    );
  }

  if (state === "empty") {
    if (section === "briefings") {
      return (
        <EmptyBox
          title="No briefings yet."
          body="Select documents below and Signal Notes will read only those."
        >
          {/* The composer arrives in P3; a dead button would be a lie, so
              this one is honestly disabled until then. */}
          <PrimaryButton type="button" disabled title="The briefing composer arrives in P3">
            <SparkIcon size={14} />
            New briefing
          </PrimaryButton>
        </EmptyBox>
      );
    }
    // Documents empty: the big drop target (canvas emptyDrop). Drag-drop
    // upload itself is P3; the target renders inert until then.
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "44px 24px",
          border: "1px dashed var(--sn-border)",
          borderRadius: 16,
          background: "transparent",
          transition: "border-color .18s,background .18s",
          marginBottom: 42,
          animation: "sn-fade .24s ease both",
        }}
      >
        <UploadIcon size={26} color="var(--sn-muted)" />
        <div style={{ fontFamily: SERIF, fontSize: 19, marginTop: 12 }}>
          Drop your first document here
        </div>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.65,
            color: "var(--sn-muted)",
            margin: "9px 0 16px",
            textAlign: "center",
            maxWidth: "44ch",
          }}
        >
          Or paste raw text. Briefings can only read what lives here.
        </p>
        <PrimaryButton type="button" disabled title="The add-document sheet arrives in P3">
          <PlusIcon size={14} />
          Add document
        </PrimaryButton>
      </div>
    );
  }

  // populated
  if (children) return <>{children}</>;
  return (
    <p
      style={{
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: "var(--sn-faint)",
        margin: "0 0 42px",
      }}
    >
      {count ?? "?"} on record — the {section === "briefings" ? "briefing cards" : "document tiles"} render in P3.
    </p>
  );
}
