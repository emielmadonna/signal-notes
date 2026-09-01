// Micro labels — IBM Plex Mono 9px, uppercase, letterspacing per DESIGN-SPEC
// §1 (.12–.16em) with the exact per-variant tracking from the canvas:
// microLabel .16em muted · microFaint .12em faint · microAccent .14em accent.
import type { ComponentProps, CSSProperties } from "react";

const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

function microStyle(letterSpacing: string, color: string): CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing,
    textTransform: "uppercase",
    color,
  };
}

type MicroProps = ComponentProps<"span">;

/** Canvas microLabel: mono 9px, .16em, muted. */
export function MicroLabel({ children, style, ...props }: MicroProps) {
  return (
    <span style={{ ...microStyle(".16em", "var(--sn-muted)"), ...style }} {...props}>
      {children}
    </span>
  );
}

/** Canvas microFaint: mono 9px, .12em, faint. */
export function MicroFaint({ children, style, ...props }: MicroProps) {
  return (
    <span style={{ ...microStyle(".12em", "var(--sn-faint)"), ...style }} {...props}>
      {children}
    </span>
  );
}

/** Canvas microAccent: mono 9px, .14em, accent. */
export function MicroAccent({ children, style, ...props }: MicroProps) {
  return (
    <span style={{ ...microStyle(".14em", "var(--sn-accent)"), ...style }} {...props}>
      {children}
    </span>
  );
}
