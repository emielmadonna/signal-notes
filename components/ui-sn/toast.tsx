// Pill toast (canvas toastStyle) — rises in with sn-rise, accent check icon
// + 12.5px text, sheet background with a hairline border. The canvas shows
// it inline under the documents grid (margin-top 14px), e.g.
// "<file> added" after a drop.
import type { CSSProperties, ReactNode } from "react";
import { CheckIcon } from "./icons";

export function Toast({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        marginTop: 14,
        padding: "9px 15px",
        borderRadius: 100,
        background: "var(--sn-sheet)",
        border: "1px solid var(--sn-border)",
        animation: "sn-rise .2s ease both",
        ...style,
      }}
    >
      <CheckIcon size={13} color="var(--sn-accent)" />
      <span style={{ fontSize: 12.5 }}>{children}</span>
    </div>
  );
}
