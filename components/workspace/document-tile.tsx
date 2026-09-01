"use client";

// DOCUMENT TILES (P3 card-007) — real rows rendered with the canvas values
// (d.tile/d.badge/d.nameStyle/d.metaStyle/d.openBtn + addTile/addCircle).
// Click toggles selection; hover lifts the icon 4px and reveals the mono
// OPEN, which routes to the document sheet. The add tile routes to the add
// sheet. Drag-drop upload itself belongs to card-008.
//
// Meta line: "SIZE · D MMM" (canvas shows "312 KB · 12 AUG · M. ELLISON").
// The ADDER is deliberately absent for now: documents.added_by is an
// auth.users id, and auth.users is not exposed to the client (by design) —
// there is no org-scoped profile/email table to join yet, so rendering a
// name here would mean either a forbidden auth.users join or an invented
// value. The mono meta renders honestly without it until a profiles seam
// exists (see the card notes).
import { useState, type KeyboardEvent } from "react";
import { FileIcon } from "@/components/ui-sn/file-icon";
import { PlusIcon } from "@/components/ui-sn/icons";
import { humanSize, docDate } from "@/lib/format";
import type { WorkspaceDocument } from "@/lib/workspace-data";

const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

function DocumentTile({
  doc,
  selected,
  onToggle,
  onOpen,
}: {
  doc: WorkspaceDocument;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const on = selected;

  // Invisible-to-the-eye accessibility on the canvas's clickable div:
  // Enter/Space toggle selection exactly like a click.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-label={`${doc.title} — ${on ? "selected" : "not selected"}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      style={{
        padding: "14px 8px",
        borderRadius: 14,
        cursor: "pointer",
        background: on ? "var(--sn-tile-selected-bg)" : "transparent",
        transition: "background .18s",
      }}
    >
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        <FileIcon
          ext={doc.ext}
          size="md"
          selected={on}
          style={hovered ? { transform: "translateY(-4px)" } : undefined}
        />
        {/* Selection check badge (canvas dot()): scales in when selected. */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 19,
            height: 19,
            borderRadius: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            background: on ? "var(--sn-accent)" : "transparent",
            border: `1px solid ${on ? "var(--sn-accent)" : "var(--sn-border)"}`,
            color: "var(--sn-on-accent)",
            opacity: on ? 1 : 0,
            transform: `scale(${on ? "1" : ".7"})`,
            transition: "all .18s cubic-bezier(.2,.8,.3,1)",
          }}
        >
          {on ? "✓" : ""}
        </span>
      </div>
      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          lineHeight: 1.4,
          marginTop: 11,
          wordBreak: "break-word",
          color: "var(--sn-text)",
        }}
      >
        {doc.title}
      </div>
      <div
        style={{
          textAlign: "center",
          fontFamily: MONO,
          fontSize: 8.5,
          letterSpacing: ".1em",
          color: "var(--sn-faint)",
          marginTop: 5,
        }}
      >
        {humanSize(doc.size_bytes)} · {docDate(doc.created_at)}
      </div>
      {/* Mono OPEN reveals on hover (canvas d.openBtn). */}
      <button
        type="button"
        tabIndex={hovered ? 0 : -1}
        aria-label={`Open ${doc.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        style={{
          display: "block",
          margin: "9px auto 0",
          border: 0,
          background: "transparent",
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: ".12em",
          color: hovered ? "var(--sn-accent)" : "transparent",
          cursor: "pointer",
          transition: "color .16s",
        }}
      >
        Open
      </button>
    </div>
  );
}

export function DocumentGrid({
  documents,
  selectedIds,
  onToggle,
  onOpen,
  onAdd,
}: {
  documents: WorkspaceDocument[];
  selectedIds: ReadonlySet<string>;
  /** Tile click → toggle this document in the selection (context). */
  onToggle: (doc: WorkspaceDocument) => void;
  /** Hover OPEN → the document sheet route. */
  onOpen: (documentId: string) => void;
  /** Add tile → the add-document sheet route. */
  onAdd: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(134px,1fr))",
        gap: "clamp(12px,1.6vw,20px)",
        marginBottom: 42,
      }}
    >
      {documents.map((doc) => (
        <DocumentTile
          key={doc.id}
          doc={doc}
          selected={selectedIds.has(doc.id)}
          onToggle={() => onToggle(doc)}
          onOpen={() => onOpen(doc.id)}
        />
      ))}
      {/* Add tile (canvas addTile/addCircle). */}
      <button
        type="button"
        onClick={onAdd}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          padding: "14px 8px",
          border: "1px dashed var(--sn-border)",
          borderRadius: 14,
          background: "transparent",
          color: "var(--sn-muted)",
          cursor: "pointer",
          minHeight: 150,
          transition: "border-color .18s,background .18s",
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 100,
            border: "1px solid var(--sn-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--sn-muted)",
          }}
        >
          <PlusIcon size={14} />
        </span>
        <span style={{ fontSize: 12, color: "inherit", opacity: 0.75 }}>
          Add document
        </span>
      </button>
    </div>
  );
}
