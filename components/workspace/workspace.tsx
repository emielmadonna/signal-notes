"use client";

// The single authenticated workspace screen (DESIGN-SPEC §2): header h62,
// scrollable main with BRIEFINGS then DOCUMENTS, floating selection bar.
// Section states come live from useWorkspaceCounts (real count fetches);
// the populated grids themselves are P3's. Search state lives here so P3
// can filter both sections from one place.
import { useRef, useState } from "react";
import {
  SelectionBar,
  SelectionProvider,
  useSelection,
} from "@/components/selection-bar";
import { MicroFaint, MicroLabel } from "@/components/ui-sn/micro";
import { useWorkspaceCounts, type SectionData } from "@/lib/workspace-data";
import { WorkspaceHeader } from "./header";
import { SectionState } from "./section-state";

const SERIF = "var(--font-literata), Literata, Georgia, serif";

// Section sub-line (canvas briefSub/docSub): LOADING / UNAVAILABLE / NONE /
// the real count. "ONE RUNNING" and "N OF …" search subs arrive with P3's
// real rows and filtering.
function subLabel(data: SectionData, section: "briefings" | "documents") {
  if (data.state === "loading") return "LOADING";
  if (data.state === "error") return "UNAVAILABLE";
  if (data.state === "empty") return "NONE";
  const n = data.count ?? 0;
  if (section === "documents") return n === 1 ? "1 FILE" : `${n} FILES`;
  return `${n}`;
}

function WorkspaceInner({
  email,
  displayName,
  initials,
  orgName,
  orgError,
  signOutError,
  signOutAction,
}: WorkspaceProps) {
  const [query, setQuery] = useState("");
  const { briefings, documents, retry } = useWorkspaceCounts();
  const { items } = useSelection();
  const documentsRef = useRef<HTMLDivElement>(null);

  return (
    <div
      style={{
        width: "100%",
        height: "100dvh",
        minWidth: 360,
        background: "var(--sn-bg)",
        color: "var(--sn-text)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        transition: "background .25s,color .25s",
      }}
    >
      <WorkspaceHeader
        email={email}
        displayName={displayName}
        initials={initials}
        orgName={orgName}
        orgError={orgError}
        query={query}
        onQueryChange={setQuery}
        signOutAction={signOutAction}
        onAllDocuments={() =>
          documentsRef.current?.scrollIntoView({ behavior: "smooth" })
        }
      />

      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: `clamp(18px,2.4vw,28px) clamp(14px,2vw,26px) ${items.length ? "140px" : "60px"}`,
        }}
      >
        {signOutError ? (
          // Rule 3: the failed sign-out write is surfaced, not swallowed.
          <p
            role="alert"
            style={{
              color: "var(--sn-danger)",
              fontSize: 12.5,
              margin: "0 0 16px",
            }}
          >
            Sign-out didn&apos;t complete. Try again from the account menu.
          </p>
        ) : null}

        {/* BRIEFINGS */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(18px,2vw,21px)",
              fontWeight: 400,
              margin: 0,
            }}
          >
            Briefings
          </h2>
          <MicroLabel>{subLabel(briefings, "briefings")}</MicroLabel>
        </div>
        <SectionState
          section="briefings"
          state={briefings.state}
          count={briefings.count}
          onRetry={retry}
        />

        {/* DOCUMENTS */}
        <div
          ref={documentsRef}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 18,
            scrollMarginTop: 18,
          }}
        >
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(18px,2vw,21px)",
              fontWeight: 400,
              margin: 0,
            }}
          >
            Documents
          </h2>
          <MicroLabel>{subLabel(documents, "documents")}</MicroLabel>
          <span style={{ flex: 1 }} />
          <MicroFaint>DRAG FILES ANYWHERE HERE</MicroFaint>
        </div>
        <SectionState
          section="documents"
          state={documents.state}
          count={documents.count}
          onRetry={retry}
        />
      </main>

      {/* Selection bar shell — hidden until P3 populates the selection. */}
      <SelectionBar />
    </div>
  );
}

export type WorkspaceProps = {
  email: string;
  displayName: string;
  initials: string;
  orgName: string | null;
  orgError: string | null;
  /** True when the last sign-out attempt failed (?error=signout). */
  signOutError: boolean;
  signOutAction: () => Promise<void>;
};

export function Workspace(props: WorkspaceProps) {
  return (
    <SelectionProvider>
      <WorkspaceInner {...props} />
    </SelectionProvider>
  );
}
