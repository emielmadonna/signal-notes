"use client";

// Scrim + Sheet — the modal surface every overlay uses (DESIGN-SPEC §3
// SHEETS). Values from the canvas scrim/sheetStyle/closeBtn: scrim
// rgba(6,6,5,.72 dark / .45 light), sheet rises .24s, widths per variant
// (brief 1080 / doc 960 / default 740 / narrow 460), radius 16. Closes on
// scrim click and on Escape. The brief variant is transparent and
// borderless — the briefing paper card supplies its own chrome.
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { CloseIcon } from "./icons";

export type SheetVariant = "brief" | "doc" | "default" | "narrow";

const SHEET_WIDTH: Record<SheetVariant, number> = {
  brief: 1080,
  doc: 960,
  default: 740,
  narrow: 460,
};

/** Full-viewport scrim; calls onClose on a direct click or on Escape. */
export function Scrim({
  onClose,
  children,
  style,
}: {
  onClose: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={(event) => {
        // Only a click on the scrim itself closes; clicks inside the sheet
        // bubble up with a different target.
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--sn-scrim)",
        zIndex: 50,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "clamp(12px,2vw,24px)",
        overflow: "auto",
        animation: "sn-fade .16s ease both",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The rising sheet panel inside the scrim. */
export function Sheet({
  variant = "default",
  onClose,
  children,
  style,
  "aria-label": ariaLabel,
}: {
  variant?: SheetVariant;
  onClose: () => void;
  children: ReactNode;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  const isBrief = variant === "brief";
  return (
    <Scrim onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{
          width: "100%",
          maxWidth: SHEET_WIDTH[variant],
          background: isBrief ? "transparent" : "var(--sn-sheet)",
          border: isBrief ? 0 : "1px solid var(--sn-border)",
          borderRadius: 16,
          overflow: "visible",
          boxShadow: "0 30px 60px -30px rgba(0,0,0,.9)",
          animation: "sn-rise .24s cubic-bezier(.2,.8,.3,1) both",
          ...style,
        }}
      >
        {children}
      </div>
    </Scrim>
  );
}

/** 31px round ghost close button (canvas closeBtn). */
export function SheetCloseButton({
  onClose,
  style,
}: {
  onClose: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      style={{
        width: 31,
        height: 31,
        borderRadius: 100,
        border: "1px solid var(--sn-border)",
        background: "transparent",
        color: "var(--sn-muted)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color .16s",
        ...style,
      }}
    >
      <CloseIcon size={14} />
    </button>
  );
}
