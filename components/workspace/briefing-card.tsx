"use client";

// BRIEFING CARDS (P3 card-007) — the real paper cards from DESIGN-SPEC §3,
// every value from the canvas renderVals() (b.cell/b.card/b.margin/b.rules/
// b.dateStyle/b.stamp/b.titleStyle/b.subStyle/b.metaStyle/b.noteStyle/
// b.delBtn/b.tray/b.trayHead + bentoGrid + the flipTo FLIP technique),
// rendering REAL rows from lib/workspace-data.
//
// Hover: lift −2px, delete button fades in top-right, ATTACHED DOCUMENTS
// tray expands below with the briefing's real source files; the other cards
// FLIP-animate into their new places (ported from the canvas flipTo()).
//
// Delete: the card's delete button opens the confirm sheet (exact canvas
// DELETE copy for a briefing); Delete goes "Deleting…" (R10), the supabase
// { error } is surfaced inline in the sheet (R3), and on success the row is
// removed from local state optimistically — no refetch-the-world (R10).
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { DangerButton, GhostButton } from "@/components/ui-sn/buttons";
import { FileIcon } from "@/components/ui-sn/file-icon";
import { TrashIcon } from "@/components/ui-sn/icons";
import { Sheet } from "@/components/ui-sn/sheet";
import { humanSize, briefingDate } from "@/lib/format";
import { deleteBriefing, type WorkspaceBriefing } from "@/lib/workspace-data";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

const mix = (color: string, pct: string) =>
  `color-mix(in srgb, ${color} ${pct}, transparent)`;

// Canvas status → color: GENERATING accent / FAILED danger / COMPLETE muted
// (stamp border at 66 hex alpha = 40% for the muted complete state).
function stampColor(status: WorkspaceBriefing["status"]): string {
  if (status === "failed") return "var(--sn-danger)";
  if (status === "generating") return "var(--sn-accent)";
  return "var(--sn-card-muted)";
}

function ratingLabel(rating: WorkspaceBriefing["myRating"]): string {
  if (rating === "up") return "RATED USEFUL";
  if (rating === "down") return "RATED NOT USEFUL";
  return "NOT RATED";
}

function BriefingCard({
  briefing,
  hovered,
  onHoverStart,
  onHoverEnd,
  onOpen,
  onOpenDocument,
  onAskDelete,
  cellRef,
}: {
  briefing: WorkspaceBriefing;
  hovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onOpen: () => void;
  onOpenDocument: (documentId: string) => void;
  onAskDelete: () => void;
  cellRef: (el: HTMLDivElement | null) => void;
}) {
  const b = briefing;
  const on = hovered;
  const color = stampColor(b.status);
  const title = b.title?.trim() ? b.title : "Untitled briefing";

  // Canvas b.subStyle: sans muted excerpt (complete) / mono 10.5 accent live
  // step (generating) / danger "Didn't finish…" (failed).
  let subText: string;
  let subStyle: CSSProperties;
  if (b.status === "generating") {
    // TODO(P4): the live generation step text ("Extracting themes from … ·
    // step 3 of 8") streams in with the generator; until then the card says
    // honestly that it is generating, in the canvas's mono accent voice.
    subText = "Generating…";
    subStyle = {
      display: "block",
      marginTop: 5,
      fontSize: 10.5,
      lineHeight: 1.5,
      color: "var(--sn-accent)",
      fontFamily: MONO,
    };
  } else if (b.status === "failed") {
    subText = "Didn't finish — try again.";
    subStyle = {
      display: "block",
      marginTop: 5,
      fontSize: 12.5,
      lineHeight: 1.5,
      color: "var(--sn-danger)",
      fontFamily: SANS,
    };
  } else {
    // Complete: first sentence of the lede / body excerpt when sections
    // exist; an em-dash otherwise (never invented copy).
    subText = b.excerpt ?? "—";
    subStyle = {
      display: "block",
      marginTop: 5,
      fontSize: 12.5,
      lineHeight: 1.5,
      color: "var(--sn-card-muted)",
      fontFamily: SANS,
    };
  }

  const cardEdge = on ? mix("var(--sn-accent)", "33.3%") : "var(--sn-card-edge)";

  return (
    <div
      ref={cellRef}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      style={{
        position: "relative",
        zIndex: on ? 5 : 1,
        flex: "1 1 300px",
        minWidth: "min(300px,100%)",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "flex-start",
          width: "100%",
          minHeight: 196,
          textAlign: "left",
          padding: 0,
          fontSize: 0,
          lineHeight: 0,
          border: `1px solid ${cardEdge}`,
          borderBottom: on ? 0 : `1px solid var(--sn-card-edge)`,
          cursor: "pointer",
          background: "var(--sn-card)",
          borderRadius: on ? "12px 12px 0 0" : 12,
          overflow: "hidden",
          boxShadow: on
            ? "var(--sn-card-shadow),var(--sn-card-hover-shadow)"
            : "var(--sn-card-shadow)",
          transform: `translateY(${on ? "-2px" : "0"})`,
          transition:
            "transform .38s cubic-bezier(.32,.72,0,1),box-shadow .38s cubic-bezier(.32,.72,0,1),border-color .28s ease,border-radius .2s ease",
        }}
      >
        {/* Red margin rule at 34px + ruled lines every 22px (canvas). */}
        <span
          style={{
            position: "absolute",
            left: 34,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--sn-card-margin)",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 42,
            bottom: 0,
            backgroundImage:
              "repeating-linear-gradient(transparent 0px,transparent 21px,var(--sn-card-rule) 22px)",
          }}
        />
        <span
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px 0 48px",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 8.5,
              letterSpacing: ".16em",
              color: "var(--sn-card-muted)",
            }}
          >
            {briefingDate(b.created_at)}
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 8.5,
              letterSpacing: ".14em",
              padding: "3px 9px",
              borderRadius: 100,
              border: `1px solid ${
                b.status === "complete" ? mix(color, "40%") : color
              }`,
              color,
            }}
          >
            {b.status.toUpperCase()}
          </span>
        </span>
        <span
          style={{
            position: "relative",
            display: "block",
            padding: "8px 16px 0 48px",
            textAlign: "left",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <span
            style={{
              display: "block",
              fontFamily: SERIF,
              fontSize: 19,
              lineHeight: "22px",
              color: "var(--sn-card-text)",
              minHeight: 44,
            }}
          >
            {title}
          </span>
          <span style={subStyle}>{subText}</span>
        </span>
        <span
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px 14px 48px",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: ".1em",
              color: "var(--sn-card-muted)",
            }}
          >
            {b.sources.length} SOURCES
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: ".1em",
              color: b.notesCount > 0 ? "var(--sn-accent)" : "var(--sn-card-muted)",
            }}
          >
            {b.notesCount} NOTES
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: ".1em",
              color: "var(--sn-card-muted)",
            }}
          >
            {ratingLabel(b.myRating)}
          </span>
        </span>
      </button>

      {/* Delete button fades in on hover (canvas b.delBtn). */}
      <button
        type="button"
        aria-label={`Delete briefing "${title}"`}
        onClick={(e) => {
          e.stopPropagation();
          onAskDelete();
        }}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 6,
          width: 28,
          height: 28,
          borderRadius: 100,
          border: "1px solid var(--sn-card-btn-border)",
          background: "var(--sn-card)",
          color: "var(--sn-danger)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: on ? 1 : 0,
          transform: `scale(${on ? "1" : ".85"})`,
          pointerEvents: on ? "auto" : "none",
          transition:
            "opacity .24s cubic-bezier(.32,.72,0,1),transform .24s cubic-bezier(.32,.72,0,1)",
        }}
      >
        <TrashIcon size={13} />
      </button>

      {/* ATTACHED DOCUMENTS tray (canvas b.tray): the real source files. */}
      <div
        aria-hidden={!on}
        style={{
          position: "relative",
          margin: on ? "-2px 0 0" : 0,
          background: "var(--sn-card)",
          border: `1px solid ${on ? mix("var(--sn-accent)", "33.3%") : "transparent"}`,
          borderTop: 0,
          borderRadius: "0 0 12px 12px",
          overflow: "hidden",
          boxShadow: on ? "var(--sn-card-hover-shadow)" : "none",
          transform: `translateY(${on ? "-2px" : "0"})`,
          transition:
            "max-height .42s cubic-bezier(.32,.72,0,1),opacity .28s cubic-bezier(.32,.72,0,1),transform .38s cubic-bezier(.32,.72,0,1)",
          maxHeight: on ? 260 : 0,
          opacity: on ? 1 : 0,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: ".16em",
            color: "var(--sn-muted)",
            padding: "12px 16px 6px 48px",
            borderTop: "1px solid var(--sn-card-rule)",
          }}
        >
          ATTACHED DOCUMENTS
        </div>
        {b.sources.map((d) => (
          <button
            key={d.id}
            type="button"
            tabIndex={on ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDocument(d.id);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              width: "100%",
              padding: "8px 16px 8px 48px",
              border: 0,
              background: "transparent",
              color: "var(--sn-card-text)",
              cursor: "pointer",
              transition: "background .16s ease",
            }}
          >
            <FileIcon ext={d.ext} size="sm" />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                fontSize: 12,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {d.file_name ?? d.title}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: ".08em",
                color: "var(--sn-card-muted)",
              }}
            >
              {humanSize(d.size_bytes)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BriefingGrid({
  briefings,
  onOpenBriefing,
  onOpenDocument,
  onDeleted,
}: {
  briefings: WorkspaceBriefing[];
  /** Card click → /briefings/[id] (all states; the sheet route is P4's). */
  onOpenBriefing: (briefing: WorkspaceBriefing) => void;
  /** Tray row click → the document sheet route. */
  onOpenDocument: (documentId: string) => void;
  /** Optimistic local removal after a confirmed delete (R10). */
  onDeleted: (briefingId: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  hoverRef.current = hover;

  // --- FLIP reflow, ported from the canvas flipTo(): capture every cell's
  // rect BEFORE the hover state changes, then invert-and-play the delta
  // after React lays the cards out again. --------------------------------
  const cells = useRef(new Map<string, HTMLDivElement>());
  const prevRects = useRef<Map<string, DOMRect> | null>(null);

  const flipTo = useCallback((id: string | null) => {
    const prev = new Map<string, DOMRect>();
    cells.current.forEach((el, key) => prev.set(key, el.getBoundingClientRect()));
    prevRects.current = prev;
    setHover(id);
  }, []);

  useLayoutEffect(() => {
    const prev = prevRects.current;
    if (!prev) return;
    prevRects.current = null;
    cells.current.forEach((el, key) => {
      const before = prev.get(key);
      if (!before) return;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = "transform .42s cubic-bezier(.32,.72,0,1)";
          el.style.transform = "translate(0px,0px)";
        });
      });
    });
  }, [hover]);

  // Canvas hover debounce: 90ms in, 80ms out, one shared timer.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverStart = useCallback(
    (id: string) => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => flipTo(id), 90);
    },
    [flipTo]
  );
  const hoverEnd = useCallback(
    (id: string) => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => {
        if (hoverRef.current === id) flipTo(null);
      }, 80);
    },
    [flipTo]
  );

  // --- Delete-confirm flow (this card owns briefing deletion). ----------
  const [confirming, setConfirming] = useState<WorkspaceBriefing | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeConfirm = useCallback(() => {
    // Never close mid-flight: the working button already blocks re-entry,
    // and the scrim/Escape path lands here too.
    if (deleting) return;
    setConfirming(null);
    setDeleteError(null);
  }, [deleting]);

  const confirmDelete = useCallback(async () => {
    if (!confirming || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    // R3: the { error } comes back as a string and is surfaced inline
    // below — never swallowed, never rendered as success.
    const { error } = await deleteBriefing(confirming.id);
    setDeleting(false);
    if (error) {
      setDeleteError(error);
      return;
    }
    // R10: optimistic local removal on success; no refetch-the-world.
    onDeleted(confirming.id);
    setConfirming(null);
  }, [confirming, deleting, onDeleted]);

  return (
    <>
      {/* Canvas bentoGrid: flex-wrap so the hovered card's tray can push. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: "clamp(14px,1.6vw,18px)",
          marginBottom: 42,
        }}
      >
        {briefings.map((b) => (
          <BriefingCard
            key={b.id}
            briefing={b}
            hovered={hover === b.id}
            onHoverStart={() => hoverStart(b.id)}
            onHoverEnd={() => hoverEnd(b.id)}
            onOpen={() => onOpenBriefing(b)}
            onOpenDocument={onOpenDocument}
            onAskDelete={() => {
              setDeleteError(null);
              setConfirming(b);
              flipTo(null);
            }}
            cellRef={(el) => {
              if (el) cells.current.set(b.id, el);
              else cells.current.delete(b.id);
            }}
          />
        ))}
      </div>

      {/* DELETE confirm sheet — exact canvas copy for a briefing. */}
      {confirming ? (
        <Sheet
          variant="narrow"
          onClose={closeConfirm}
          aria-label="Delete this briefing?"
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
              Delete this briefing?
            </h1>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--sn-muted)",
                margin: "9px 0 16px",
              }}
            >
              {confirming.title?.trim() ? confirming.title : "Untitled briefing"}
            </p>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.65,
                color: "var(--sn-muted)",
                margin: "9px 0 16px",
              }}
            >
              Briefings already grounded in these keep their citations, but the
              source text will no longer open.
            </p>
            {deleteError ? (
              // Inline error (canvas errRule pattern): the failed delete is
              // surfaced right here in the sheet, never swallowed (R3).
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
                    This briefing couldn&apos;t be deleted.
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: "var(--sn-muted)",
                      marginTop: 3,
                    }}
                  >
                    {deleteError}
                  </div>
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <DangerButton
                solid
                type="button"
                onClick={confirmDelete}
                working={deleting}
                workingLabel="Deleting…"
              >
                Delete
              </DangerButton>
              <GhostButton
                type="button"
                size="sm"
                onClick={closeConfirm}
                disabled={deleting}
              >
                Cancel
              </GhostButton>
            </div>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
