// Signal Notes icon set — every SVG ported verbatim from the canvas ICONS map
// (docs/design/canvas/Signal Notes.dc.html): same viewBox, paths, stroke
// width 1.7, round caps/joins, and per-icon default sizes.
import type { CSSProperties, ReactNode } from "react";

type IconProps = {
  size?: number;
  color?: string;
  style?: CSSProperties;
};

function Svg({
  size,
  color,
  style,
  children,
}: Required<Pick<IconProps, "size">> &
  Pick<IconProps, "color" | "style"> & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color || "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none", display: "block", ...style }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function SearchIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx={11} cy={11} r={6} />
      <path d="M15.5 15.5L20 20" />
    </Svg>
  );
}

export function PlusIcon({ size = 14, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function SparkIcon({ size = 14, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </Svg>
  );
}

export function ChevIcon({ size = 12, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function CloseIcon({ size = 14, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Svg>
  );
}

export function CheckIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 12.5l5 5 11-11" />
    </Svg>
  );
}

export function TrashIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </Svg>
  );
}

export function OpenIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v6H4V6h6" />
    </Svg>
  );
}

export function ClockIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx={12} cy={12} r={8} />
      <path d="M12 8v4.5l3 1.6" />
    </Svg>
  );
}

export function NoteIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 5h14v9l-4 5H5z" />
      <path d="M19 14h-4v5" />
    </Svg>
  );
}

export function RetryIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M20 11a8 8 0 10-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </Svg>
  );
}

export function EditIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M15 5l4 4" />
      <path d="M4 20l1-4L17 4l3 3L8 19z" />
    </Svg>
  );
}

export function ThumbUpIcon({ size = 14, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M7 11v9H4v-9z" />
      <path d="M7 11l4.5-8c1.6 0 2.4 1 2.1 2.6L13 9h5.3c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.4c-.2 1-1.1 1.7-2.1 1.7H7" />
    </Svg>
  );
}

export function ThumbDownIcon({ size = 14, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M7 13V4H4v9z" />
      <path d="M7 13l4.5 8c1.6 0 2.4-1 2.1-2.6L13 15h5.3c1.3 0 2.2-1.2 1.9-2.4l-1.6-6.4A2.2 2.2 0 0016.5 4.5H7" />
    </Svg>
  );
}

export function UploadIcon({ size = 26, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 16V5" />
      <path d="M7.5 9.5L12 5l4.5 4.5" />
      <path d="M4 16v3h16v-3" />
    </Svg>
  );
}

export function SunIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </Svg>
  );
}

export function MoonIcon({ size = 13, color, style }: IconProps) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
    </Svg>
  );
}

/**
 * The Signal Notes mark: a 22x26 document outline whose FIRST rule line is
 * always accent (#E8B32A — hard-coded in the canvas, identical in both
 * themes); the frame and the other two lines take theme colors.
 * Canvas call: ICONS.mark(T.text, T.faint).
 */
export function MarkIcon({
  c1 = "var(--sn-text)",
  c2 = "var(--sn-faint)",
  style,
}: {
  c1?: string;
  c2?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={22}
      height={26}
      viewBox="0 0 22 26"
      fill="none"
      style={{ flex: "none", display: "block", ...style }}
      aria-hidden="true"
    >
      <rect x={0.9} y={0.9} width={20.2} height={24.2} rx={4} stroke={c1} strokeWidth={1.4} />
      <path d="M5.5 7.5h11" stroke="#E8B32A" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M5.5 12.5h11" stroke={c2} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M5.5 17.5h7" stroke={c2} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}
