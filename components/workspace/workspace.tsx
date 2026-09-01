"use client";

// The single authenticated workspace screen (DESIGN-SPEC §2), now REAL
// (P3 card-007): briefing cards and document tiles render live rows from
// useWorkspaceData, the header search filters both sections client-side,
// the quick menu shows the 4 most recent documents with live selection
// toggles, and the selection bar's Open/Clear/Generate are wired.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SelectionBar,
  SelectionProvider,
  useSelection,
  type SelectionItem,
} from "@/components/selection-bar";
import { DangerButton, GhostButton } from "@/components/ui-sn/buttons";
import { MicroFaint, MicroLabel } from "@/components/ui-sn/micro";
import { Sheet } from "@/components/ui-sn/sheet";
import { deleteDocuments, takeDocumentPatches } from "@/lib/document-actions";
import {
  useWorkspaceData,
  type Section,
  type WorkspaceBriefing,
  type WorkspaceDocument,
} from "@/lib/workspace-data";
import { BriefingGrid } from "./briefing-card";
import { DocumentGrid } from "./document-tile";
import { DropZone } from "./drop-zone";
import { WorkspaceHeader, type QuickDoc } from "./header";
import { SectionState } from "./section-state";

const SERIF = "var(--font-literata), Literata, Georgia, serif";

function briefingTitle(b: WorkspaceBriefing): string {
  return b.title?.trim() ? b.title : "Untitled briefing";
}

// Section sub-lines (canvas briefSub/docSub): LOADING / UNAVAILABLE / NONE,
// else the real count — and while searching, "N OF M FILES" / "N MATCHING".
function documentsSub(
  data: Section<WorkspaceDocument>,
  shown: number,
  searching: boolean
): string {
  if (data.state === "loading") return "LOADING";
  if (data.state === "error") return "UNAVAILABLE";
  if (data.state === "empty") return "NONE";
  const total = data.rows.length;
  if (searching) return `${shown} OF ${total} ${total === 1 ? "FILE" : "FILES"}`;
  return total === 1 ? "1 FILE" : `${total} FILES`;
}

function briefingsSub(
  data: Section<WorkspaceBriefing>,
  shown: number,
  searching: boolean
): string {
  if (data.state === "loading") return "LOADING";
  if (data.state === "error") return "UNAVAILABLE";
  if (data.state === "empty") return "NONE";
  if (searching) return `${shown} MATCHING`;
  // Canvas populated sub: "4 · ONE RUNNING" while a generation is live.
  const running = data.rows.filter((b) => b.status === "generating").length;
  const suffix =
    running === 0 ? "" : running === 1 ? " · ONE RUNNING" : ` · ${running} RUNNING`;
  return `${data.rows.length}${suffix}`;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const {
    briefings,
    documents,
    retry,
    removeBriefingFromList,
    addDocumentToList,
    updateDocumentInList,
    removeDocumentsFromList,
  } = useWorkspaceData();
  const { items, setItems } = useSelection();
  const documentsRef = useRef<HTMLDivElement>(null);

  const selectedIds = useMemo(
    () => new Set(items.map((item) => item.id)),
    [items]
  );

  // A selection can only contain documents that still exist: if the list
  // refetches (or a delete lands) the stale ids are pruned.
  useEffect(() => {
    if (documents.state !== "populated") return;
    const live = new Set(documents.rows.map((d) => d.id));
    if (items.some((item) => !live.has(item.id))) {
      setItems(items.filter((item) => live.has(item.id)));
    }
  }, [documents, items, setItems]);

  // card-009: a rename saved on the /documents/[id] sheet route parks a
  // patch (the workspace is unmounted while the sheet is open); apply it the
  // moment the list is populated so the tile carries the new title even if
  // this mount's fetch served a stale response — no refetch-the-world (R10).
  useEffect(() => {
    if (documents.state !== "populated") return;
    for (const [id, patch] of takeDocumentPatches()) {
      updateDocumentInList(id, patch);
    }
  }, [documents.state, updateDocumentInList]);

  // card-009: "Use in briefing" on the document sheet lands here as /?use=id
  // (selection state lives in this tree, so the sheet route hands the id
  // over in the URL). Add that document to the live selection once the rows
  // are in, then clean the URL.
  const useParam = searchParams.get("use");
  useEffect(() => {
    if (!useParam || documents.state !== "populated") return;
    const doc = documents.rows.find((d) => d.id === useParam);
    if (doc && !items.some((item) => item.id === doc.id)) {
      setItems([...items, { id: doc.id, name: doc.title, ext: doc.ext }]);
    }
    router.replace("/", { scroll: false });
  }, [useParam, documents, items, setItems, router]);

  const toggleDocument = (doc: WorkspaceDocument) => {
    if (selectedIds.has(doc.id)) {
      setItems(items.filter((item) => item.id !== doc.id));
    } else {
      setItems([...items, { id: doc.id, name: doc.title, ext: doc.ext }]);
    }
  };

  // --- Search: one query filters BOTH sections, client-side. ------------
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const shownDocuments = useMemo(() => {
    if (!searching) return documents.rows;
    return documents.rows.filter((d) =>
      `${d.title} ${d.file_name ?? ""} ${d.kind} ${d.ext}`
        .toLowerCase()
        .includes(q)
    );
  }, [documents.rows, q, searching]);
  const shownBriefings = useMemo(() => {
    if (!searching) return briefings.rows;
    return briefings.rows.filter((b) =>
      `${briefingTitle(b)} ${b.status} ${b.excerpt ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [briefings.rows, q, searching]);

  // --- Quick menu: the 4 most recent documents (rows arrive newest-first),
  // toggling the same live selection the tiles use. ----------------------
  const quickDocs: QuickDoc[] = documents.rows.slice(0, 4).map((d) => ({
    id: d.id,
    // Canvas quick rows show the file name; pasted docs have none → title.
    name: d.file_name ?? d.title,
    ext: d.ext,
    selected: selectedIds.has(d.id),
    onToggle: () => toggleDocument(d),
  }));

  // --- Routes. The target sheets ship on later cards; navigating now is
  // real behavior (the not-found sheet answers meanwhile). ---------------
  // TODO(card-009): /documents/[id] — the document sheet route.
  const openDocument = (id: string) => router.push(`/documents/${id}`);
  // TODO(card-008): /documents/new — the add-document sheet route.
  const openAddDocument = () => router.push("/documents/new");
  // card-011 wiring: a generating OR failed briefing opens the live
  // GENERATION surface (which resumes via the events endpoint); a complete
  // briefing opens the reading view (card-012 — navigating there is real
  // behavior today, the not-found sheet answers until that route ships).
  const openBriefing = (b: WorkspaceBriefing) =>
    router.push(
      b.status === "complete"
        ? `/briefings/${b.id}`
        : `/briefings/${b.id}/generating`
    );
  // card-011 wiring: the composer route, carrying the current selection the
  // same cross-route way the document sheet hands off ?use= (the workspace's
  // SelectionProvider is unmounted while /compose is open).
  const openCompose = () => {
    const ids = items.map((item) => item.id);
    router.push(ids.length ? `/compose?docs=${ids.join(",")}` : "/compose");
  };

  // --- card-009: document delete from the selection bar. The canvas DELETE
  // sheet confirms; Delete goes "Deleting…" (R10), the { error } is surfaced
  // inline (R3), and confirmed rows leave the list optimistically (R10). ---
  const [confirmingDelete, setConfirmingDelete] = useState<
    SelectionItem[] | null
  >(null);
  const [deletingDocs, setDeletingDocs] = useState(false);
  const [docDeleteError, setDocDeleteError] = useState<string | null>(null);

  const closeDeleteConfirm = useCallback(() => {
    // Never close mid-flight; the working button already blocks re-entry.
    if (deletingDocs) return;
    setConfirmingDelete(null);
    setDocDeleteError(null);
  }, [deletingDocs]);

  const confirmDeleteDocs = useCallback(async () => {
    if (!confirmingDelete || deletingDocs) return;
    setDeletingDocs(true);
    setDocDeleteError(null);
    const { error, deletedIds } = await deleteDocuments(
      confirmingDelete.map((item) => item.id)
    );
    setDeletingDocs(false);
    if (deletedIds.length > 0) {
      // R10: whatever truly went away leaves the list (and, via the live-ids
      // pruning effect above, the selection) without a refetch.
      removeDocumentsFromList(deletedIds);
    }
    if (error) {
      // R3: zero rows deleted — or a partial delete — is a surfaced failure,
      // never a silent success.
      setDocDeleteError(error);
      return;
    }
    setItems([]);
    setConfirmingDelete(null);
  }, [
    confirmingDelete,
    deletingDocs,
    removeDocumentsFromList,
    setItems,
  ]);

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
        quickDocs={quickDocs}
        selectionCount={items.length}
        onGenerate={openCompose}
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
          <MicroLabel>
            {briefingsSub(briefings, shownBriefings.length, searching)}
          </MicroLabel>
        </div>
        <SectionState
          section="briefings"
          state={briefings.state}
          count={briefings.rows.length}
          onRetry={retry}
        >
          <BriefingGrid
            briefings={shownBriefings}
            onOpenBriefing={openBriefing}
            onOpenDocument={openDocument}
            onDeleted={removeBriefingFromList}
          />
        </SectionState>

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
          <MicroLabel>
            {documentsSub(documents, shownDocuments.length, searching)}
          </MicroLabel>
          <span style={{ flex: 1 }} />
          <MicroFaint>DRAG FILES ANYWHERE HERE</MicroFaint>
        </div>
        {/* card-008 integration: the documents section is a drop target in
            BOTH its populated and empty states (canvas: "DRAG FILES ANYWHERE
            HERE" + the big empty drop target). DropZone owns its overlay,
            uploading line, inline error and toast; a successful drop feeds
            addDocumentToList so the new tile appears without a refetch
            (R10). Dropping is disabled while the list is loading or failed —
            those states aren't real targets. */}
        <DropZone
          orgName={orgName ?? "your workspace"}
          onAdded={addDocumentToList}
          disabled={
            documents.state === "loading" || documents.state === "error"
          }
        >
          <SectionState
            section="documents"
            state={documents.state}
            count={documents.rows.length}
            onRetry={retry}
            onAdd={openAddDocument}
          >
            <DocumentGrid
              documents={shownDocuments}
              selectedIds={selectedIds}
              onToggle={toggleDocument}
              onOpen={openDocument}
              onAdd={openAddDocument}
            />
          </SectionState>
        </DropZone>
      </main>

      {/* Selection bar: Open = first selected document's sheet route;
          Generate = the composer; Clear lives in the bar itself. Rename
          (single selection only) opens the document sheet already editing;
          Delete opens the canvas DELETE confirm sheet below (card-009). */}
      <SelectionBar
        onGenerate={openCompose}
        onOpen={
          items.length > 0 ? () => openDocument(items[0].id) : undefined
        }
        onRename={
          items.length === 1
            ? () => router.push(`/documents/${items[0].id}?edit=1`)
            : undefined
        }
        renameTitle="Select a single document to rename"
        onDelete={
          items.length > 0
            ? () => {
                setDocDeleteError(null);
                setConfirmingDelete(items);
              }
            : undefined
        }
        deleting={deletingDocs}
      />

      {/* DELETE confirm sheet — exact canvas copy for documents. */}
      {confirmingDelete ? (
        <Sheet
          variant="narrow"
          onClose={closeDeleteConfirm}
          aria-label={
            confirmingDelete.length === 1
              ? "Delete this document?"
              : `Delete ${confirmingDelete.length} documents?`
          }
        >
          <div style={{ padding: "26px 30px 28px" }}>
            <h1
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(20px,2.4vw,24px)",
                fontWeight: 400,
                margin: 0,
                color: "var(--sn-text)",
              }}
            >
              Delete{" "}
              {confirmingDelete.length === 1
                ? "this document"
                : `${confirmingDelete.length} documents`}
              ?
            </h1>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--sn-muted)",
                margin: "9px 0 16px",
              }}
            >
              {confirmingDelete.map((item) => item.name).join(", ")}
            </p>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--sn-muted)",
                margin: "9px 0 16px",
              }}
            >
              Briefings already grounded in these keep their citations, but
              the source text will no longer open.
            </p>
            {docDeleteError ? (
              // R3: the failed (or partial) delete is surfaced right here.
              <div
                role="alert"
                style={{
                  display: "flex",
                  gap: 10,
                  margin: "0 0 4px",
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
                <div>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--sn-danger)",
                    }}
                  >
                    {confirmingDelete.length === 1
                      ? "This document couldn't be deleted."
                      : "These documents couldn't all be deleted."}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: "var(--sn-muted)",
                      marginTop: 3,
                    }}
                  >
                    {docDeleteError}
                  </div>
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <DangerButton
                solid
                type="button"
                onClick={confirmDeleteDocs}
                working={deletingDocs}
                workingLabel="Deleting…"
              >
                Delete
              </DangerButton>
              <GhostButton
                type="button"
                size="sm"
                onClick={closeDeleteConfirm}
                disabled={deletingDocs}
              >
                Cancel
              </GhostButton>
            </div>
          </div>
        </Sheet>
      ) : null}
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
