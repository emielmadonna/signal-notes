"use client";

// Signal Notes button primitives — styles lifted exactly from the canvas
// renderVals(): primary(h), ghost(h), dangerBtnSm, delBtn, linkBtn, tinyLink.
// Every mutation-capable button carries a working state (constitution rule
// 10): pass `working` + `workingLabel` to drive it yourself, or rely on
// useFormStatus — inside a <form action={…}> a submit-type button goes
// working automatically while the action is pending (the folded-in behavior
// of the old components/pending-button.tsx).
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useFormStatus } from "react-dom";

const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

type ButtonSize = "md" | "sm";

type SnButtonProps = ComponentProps<"button"> & {
  /** md = h34 (canvas primaryBtn/ghostBtn), sm = h31 (primaryBtnSm/ghostBtnSm). */
  size?: ButtonSize;
  /** Controlled working state; overrides the useFormStatus auto-detection. */
  working?: boolean;
  /** Label shown (and button disabled) while working, e.g. "Saving…". */
  workingLabel?: ReactNode;
};

// A button inside a pending form counts as working when it is the kind that
// submits (HTML buttons default to type="submit", so undefined counts too).
function useWorking(
  working: boolean | undefined,
  type: ComponentProps<"button">["type"]
): boolean {
  const { pending } = useFormStatus();
  if (working !== undefined) return working;
  return pending && type !== "button" && type !== "reset";
}

/** Pill primary action: accent bg, gap 7px, 600 12.5px Space Grotesk, h34 (sm h31). */
export function PrimaryButton({
  size = "md",
  working,
  workingLabel,
  children,
  disabled,
  style,
  type,
  ...props
}: SnButtonProps) {
  const isWorking = useWorking(working, type);
  // Disabled primary = the composer's zero-selection language (canvas
  // genBtnStyle/quickGen): soft bg, faint text, not-allowed cursor. A
  // *working* primary keeps its accent look and only swaps the label.
  const base: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    height: size === "sm" ? 31 : 34,
    padding: "0 16px",
    borderRadius: 100,
    border: 0,
    background: disabled ? "var(--sn-soft)" : "var(--sn-accent)",
    color: disabled ? "var(--sn-faint)" : "var(--sn-on-accent)",
    fontFamily: SANS,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    transition: "filter .16s",
    ...style,
  };
  return (
    <button
      type={type}
      disabled={disabled || isWorking}
      aria-busy={isWorking || undefined}
      style={base}
      {...props}
    >
      {isWorking && workingLabel !== undefined ? workingLabel : children}
    </button>
  );
}

/** Pill ghost action: 1px border, transparent bg, 400 12.5px, h34 (sm h31). */
export function GhostButton({
  size = "md",
  working,
  workingLabel,
  children,
  disabled,
  style,
  type,
  ...props
}: SnButtonProps) {
  const isWorking = useWorking(working, type);
  const base: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    height: size === "sm" ? 31 : 34,
    padding: "0 14px",
    borderRadius: 100,
    border: "1px solid var(--sn-border)",
    background: "transparent",
    color: "var(--sn-text)",
    fontFamily: SANS,
    fontSize: 12.5,
    fontWeight: 400,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
    transition: "border-color .16s",
    ...style,
  };
  return (
    <button
      type={type}
      disabled={disabled || isWorking}
      aria-busy={isWorking || undefined}
      style={base}
      {...props}
    >
      {isWorking && workingLabel !== undefined ? workingLabel : children}
    </button>
  );
}

/**
 * Danger action. Default is the outlined pill (canvas dangerBtnSm: h31,
 * danger text, 40%-alpha danger border). `solid` is the delete-confirm
 * variant (canvas delBtn: h34, solid danger bg, 600 12.5px).
 */
export function DangerButton({
  solid = false,
  working,
  workingLabel,
  children,
  disabled,
  style,
  type,
  ...props
}: SnButtonProps & { solid?: boolean }) {
  const isWorking = useWorking(working, type);
  const base: CSSProperties = solid
    ? {
        display: "flex",
        alignItems: "center",
        gap: 7,
        height: 34,
        padding: "0 16px",
        borderRadius: 100,
        border: 0,
        background: "var(--sn-danger)",
        color: "var(--sn-on-danger)",
        fontFamily: SANS,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }
    : {
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 31,
        padding: "0 13px",
        borderRadius: 100,
        border:
          "1px solid color-mix(in srgb, var(--sn-danger) 40%, transparent)",
        background: "transparent",
        color: "var(--sn-danger)",
        fontFamily: SANS,
        fontSize: 12,
        fontWeight: 400,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      };
  return (
    <button
      type={type}
      disabled={disabled || isWorking}
      aria-busy={isWorking || undefined}
      style={{ ...base, ...style }}
      {...props}
    >
      {isWorking && workingLabel !== undefined ? workingLabel : children}
    </button>
  );
}

/** Underlined muted text button (canvas linkBtn). */
export function LinkButton({
  children,
  style,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      style={{
        border: 0,
        background: "transparent",
        color: "var(--sn-muted)",
        fontFamily: SANS,
        fontSize: 12,
        fontWeight: 400,
        cursor: "pointer",
        textDecoration: "underline",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

/** Tiny underlined mono link, 9px letterspaced (canvas tinyLink). */
export function TinyLink({
  children,
  style,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      style={{
        border: 0,
        background: "transparent",
        padding: 0,
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: ".1em",
        color: "var(--sn-faint)",
        cursor: "pointer",
        textDecoration: "underline",
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
