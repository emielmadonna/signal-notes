"use client";

// Shared state blocks — error, empty, and the two loading skeletons — with
// every value taken from the canvas renderVals() styles (errBox/errRule/
// errTitle/errBody/errBtn, emptyBox/emptyP, briefSkel/skelSweep/skelMargin/
// skelBar1-3, skelIcon/skelName/skelMeta). Error ≠ empty ≠ loading, always
// (DESIGN-SPEC §3 STATES).
import type { CSSProperties, ReactNode } from "react";
import { RetryIcon } from "./icons";

const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const SERIF = "var(--font-literata), Literata, Georgia, serif";

const mix = (color: string, pct: string) =>
  `color-mix(in srgb, ${color} ${pct}, transparent)`;

/**
 * Danger-bordered error block: 2px danger rule, title, body, retry button.
 * Canvas errBox (danger border at 55 alpha, themed error background).
 */
export function ErrorBox({
  title,
  body,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  style,
}: {
  title: ReactNode;
  body: ReactNode;
  onRetry?: () => void;
  retryLabel?: ReactNode;
  retrying?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${mix("var(--sn-danger)", "33.3%")}`,
        borderRadius: 16,
        background: "var(--sn-err-bg)",
        padding: "18px 20px",
        marginBottom: 42,
        maxWidth: "60ch",
        display: "flex",
        gap: 14,
        animation: "sn-fade .24s ease both",
        ...style,
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
          style={{ fontSize: 13.5, fontWeight: 500, color: "var(--sn-danger)" }}
        >
          {title}
        </div>
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--sn-muted)",
            margin: "6px 0 0",
          }}
        >
          {body}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying || undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              height: 30,
              padding: "0 14px",
              borderRadius: 100,
              border: "1px solid var(--sn-danger)",
              background: "transparent",
              color: "var(--sn-danger)",
              fontFamily: SANS,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              marginTop: 13,
            }}
          >
            <RetryIcon size={13} />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Bordered empty-state block: serif title, muted explainer, CTA slot. */
export function EmptyBox({
  title,
  body,
  children,
  style,
}: {
  title: ReactNode;
  body: ReactNode;
  /** CTA area, e.g. a PrimaryButton. */
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--sn-border)",
        borderRadius: 16,
        padding: "26px 28px",
        marginBottom: 42,
        maxWidth: "60ch",
        animation: "sn-fade .24s ease both",
        ...style,
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 20 }}>{title}</div>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.65,
          color: "var(--sn-muted)",
          margin: "9px 0 16px",
        }}
      >
        {body}
      </p>
      {children}
    </div>
  );
}

// The accent sweep both skeletons share (canvas skelSweep; accent at 22 hex
// alpha = 13.3%).
function SkeletonSweep() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 80,
        background: `linear-gradient(90deg,transparent,${mix(
          "var(--sn-accent)",
          "13.3%"
        )},transparent)`,
        animation: "sn-sweep 1.5s linear infinite",
      }}
    />
  );
}

/** Briefing-card loading skeleton: ruled paper bg, red margin, accent sweep. */
export function BriefingCardSkeleton({ style }: { style?: CSSProperties }) {
  const bar = (extra: CSSProperties): CSSProperties => ({
    position: "absolute",
    borderRadius: 3,
    ...extra,
  });
  return (
    <div
      aria-hidden="true"
      style={{
        borderRadius: 12,
        background: "var(--sn-card)",
        height: 176,
        position: "relative",
        overflow: "hidden",
        border: "1px solid var(--sn-soft)",
        ...style,
      }}
    >
      <SkeletonSweep />
      <div
        style={{
          position: "absolute",
          left: 34,
          top: 0,
          bottom: 0,
          width: 1,
          background: mix("var(--sn-card-margin)", "40%"),
        }}
      />
      <div
        style={bar({
          left: 48,
          right: 18,
          top: 22,
          height: 13,
          background: "var(--sn-skel-bar1)",
        })}
      />
      <div
        style={bar({
          left: 48,
          right: 70,
          top: 48,
          height: 11,
          background: "var(--sn-skel-bar2)",
        })}
      />
      <div
        style={bar({
          left: 48,
          width: 90,
          bottom: 20,
          height: 9,
          background: "var(--sn-skel-bar2)",
        })}
      />
    </div>
  );
}

/** Document-tile loading skeleton: shimmering icon block + name/meta bars. */
export function DocTileSkeleton({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 8px",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <SkeletonSweep />
      <div
        style={{
          width: 52,
          height: 66,
          borderRadius: 8,
          background: `linear-gradient(90deg,var(--sn-skel-icon-edge) 0%,var(--sn-skel-icon-mid) 50%,var(--sn-skel-icon-edge) 100%)`,
          backgroundSize: "340px 100%",
          animation: "sn-shim 1.3s linear infinite",
        }}
      />
      <div
        style={{
          height: 9,
          width: "78%",
          borderRadius: 3,
          background: "var(--sn-skel-icon-edge)",
          marginTop: 13,
        }}
      />
      <div
        style={{
          height: 7,
          width: "52%",
          borderRadius: 3,
          background: "var(--sn-skel-meta)",
          marginTop: 8,
        }}
      />
    </div>
  );
}
