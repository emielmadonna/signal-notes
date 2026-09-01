// components/generation/tags.ts — map a generation_events line onto the
// canvas activity-log TAG pill (DESIGN-SPEC §1 log tag colors + §4 kind map).
//
// The engine's four kinds carry the vocabulary; `status` content is rich
// enough to earn the canvas's finer PLAN/CHECK/DONE/ERROR labels, all derived
// truthfully from the real text the engine wrote (lib/ai/generation.ts):
//
//   tool_call            -> TOOL   blue    (#7FA6D9)   mono text
//   thinking             -> THINK  purple  (#B08CD9)   quieter (dimmed serif-ish)
//   status "Planning …"  -> PLAN   accent
//   status "… citation…" -> CHECK  accent
//   status "…complete."  -> DONE   green   (#8FBF87)
//   status "…didn't finish…" -> ERROR danger
//   any other status     -> STATUS accent
//
// The DONE-green line comes from the engine's own "Briefing complete." status
// event, so the terminal `done` marker adds no duplicate line — it only flips
// the status chip and progress bar in the surface.
import type { LogLine } from "@/lib/use-generation-stream";

export type LineTag = {
  label: string;
  /** Pill border + text color (a CSS color or token). */
  color: string;
  /** Body text set in mono (tool calls) rather than sans. */
  mono: boolean;
  /** Rendered quieter — thinking is present but recedes. */
  quiet: boolean;
};

const TOOL = "#7FA6D9";
const THINK = "#B08CD9";
const DONE = "#8FBF87";
const ACCENT = "var(--sn-accent)";
const DANGER = "var(--sn-danger)";

/** The engine's own failure-note prefix (generation.ts). */
export const FAILURE_NOTE_PREFIX = "This briefing didn't finish";

export function describeLine(line: LogLine): LineTag {
  if (line.kind === "tool_call") {
    return { label: "TOOL", color: TOOL, mono: true, quiet: false };
  }
  if (line.kind === "thinking") {
    return { label: "THINK", color: THINK, mono: false, quiet: true };
  }

  // status — refine from the real content.
  const content = line.content;
  const lower = content.toLowerCase();
  if (content.startsWith(FAILURE_NOTE_PREFIX)) {
    return { label: "ERROR", color: DANGER, mono: false, quiet: false };
  }
  if (lower.includes("complete")) {
    return { label: "DONE", color: DONE, mono: false, quiet: false };
  }
  if (lower.startsWith("planning")) {
    return { label: "PLAN", color: ACCENT, mono: false, quiet: false };
  }
  if (lower.includes("citation")) {
    return { label: "CHECK", color: ACCENT, mono: false, quiet: false };
  }
  return { label: "STATUS", color: ACCENT, mono: false, quiet: false };
}
