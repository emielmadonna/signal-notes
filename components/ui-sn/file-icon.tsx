// FileIcon — the little document glyph used on tiles, chips, trays and
// sheets. Geometry ported exactly from the canvas fileIcon(ext, size, on):
// width 18/52/64 (sm/md/lg), height = round(width * 1.3), folded corner in
// the type color at 2E alpha, two rule lines at 44/33 alpha, centered mono
// ext label; selected = accent ring shadow (accent at 33 alpha, 3px).
// As in the canvas, sm icons draw only the fold + label (no rule lines);
// md/lg draw both rules. Hover lift is applied by the parent (the canvas
// translates the icon -4px on tile hover); the transition lives here.
import type { CSSProperties } from "react";

const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

export type FileExt =
  | "PDF"
  | "DOCX"
  | "TXT"
  | "MD"
  | "RTF"
  | "WEB"
  | "HTML"
  | "XML"
  | "CSV"
  | "TSV"
  | "JSON"
  | "YAML"
  | "SRT"
  | "VTT"
  | "LOG";
export type FileIconSize = "sm" | "md" | "lg";

// File-type colors (DESIGN-SPEC §1), routed through the token layer.
//
// The six the design system named keep their own tokens. The formats the
// uploader grew later (lib/ingest/file-types.ts) are deliberately mapped onto
// those SAME six by family rather than given nine improvised new colors: the
// markup family reads as WEB, the structured-data family as MD, and the
// transcript/plain family as TXT. No styling is invented here, and an unknown
// label still falls back to muted below.
const EXT_COLOR: Record<FileExt, string> = {
  PDF: "var(--sn-file-pdf)",
  DOCX: "var(--sn-file-docx)",
  TXT: "var(--sn-file-txt)",
  MD: "var(--sn-file-md)",
  RTF: "var(--sn-file-rtf)",
  WEB: "var(--sn-file-web)",
  HTML: "var(--sn-file-web)",
  XML: "var(--sn-file-web)",
  CSV: "var(--sn-file-md)",
  TSV: "var(--sn-file-md)",
  JSON: "var(--sn-file-md)",
  YAML: "var(--sn-file-md)",
  SRT: "var(--sn-file-txt)",
  VTT: "var(--sn-file-txt)",
  LOG: "var(--sn-file-txt)",
};

// Hex-alpha → percentage used with color-mix (2E=18%, 33=20%, 44=26.7%).
const mix = (color: string, pct: string) =>
  `color-mix(in srgb, ${color} ${pct}, transparent)`;

export function FileIcon({
  ext,
  size = "md",
  selected = false,
  style,
}: {
  ext: FileExt | (string & {});
  size?: FileIconSize;
  selected?: boolean;
  style?: CSSProperties;
}) {
  const key = ext.toUpperCase() as FileExt;
  const c = EXT_COLOR[key] ?? "var(--sn-muted)";
  const w = size === "sm" ? 18 : size === "md" ? 52 : 64;
  const h = Math.round(w * 1.3);
  const fs = size === "sm" ? 6 : 9.5;

  const wrap: CSSProperties = {
    width: w,
    height: h,
    flex: "none",
    position: "relative",
    display: "block",
    borderRadius: size === "sm" ? 4 : 8,
    background: "var(--sn-file-bg)",
    // Unselected border alpha is theme-dependent (hex 55 dark / 77 light),
    // carried by the --sn-file-border-alpha token.
    border: `1px solid ${
      selected ? c : mix(c, "var(--sn-file-border-alpha)")
    }`,
    boxShadow: selected
      ? `0 0 0 3px ${mix("var(--sn-accent)", "20%")}`
      : "var(--sn-file-shadow)",
    transition:
      "transform .2s cubic-bezier(.2,.8,.3,1),box-shadow .2s,border-color .2s",
    ...style,
  };

  const fold: CSSProperties = {
    position: "absolute",
    right: 0,
    top: 0,
    width: Math.round(w * 0.3),
    height: Math.round(w * 0.3),
    background: mix(c, "18%"),
    borderBottomLeftRadius: 6,
    borderTopRightRadius: size === "sm" ? 3 : 7,
  };

  const rule1: CSSProperties = {
    position: "absolute",
    left: Math.round(w * 0.18),
    right: Math.round(w * 0.18),
    top: Math.round(h * 0.42),
    height: 1,
    background: mix(c, "26.7%"),
  };

  const rule2: CSSProperties = {
    position: "absolute",
    left: Math.round(w * 0.18),
    right: Math.round(w * 0.34),
    top: Math.round(h * 0.55),
    height: 1,
    background: mix(c, "20%"),
  };

  const label: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: size === "sm" ? 2 : 7,
    textAlign: "center",
    fontFamily: MONO,
    fontSize: fs,
    letterSpacing: ".06em",
    color: c,
  };

  return (
    <span style={wrap} aria-label={`${key} file`}>
      <span style={fold} />
      {size !== "sm" ? <span style={rule1} /> : null}
      {size !== "sm" ? <span style={rule2} /> : null}
      <span style={label}>{key}</span>
    </span>
  );
}
