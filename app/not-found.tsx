// Shared quiet not-found page, restyled to the canvas NOT FOUND sheet: the
// 460px sheet on the app background — serif title, muted explainer, primary
// "Back to briefings". Cross-org URL probing lands here too (P3 wires
// notFound() calls): no error dump, no blank — just a way back.
import Link from "next/link";

const SERIF = "var(--font-literata), Literata, Georgia, serif";
const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--sn-bg)",
        color: "var(--sn-text)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "clamp(12px,2vw,24px)",
        paddingTop: "18vh",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--sn-sheet)",
          border: "1px solid var(--sn-border)",
          borderRadius: 16,
          boxShadow: "0 30px 60px -30px rgba(0,0,0,.9)",
          animation: "sn-rise .24s cubic-bezier(.2,.8,.3,1) both",
          padding: "30px 32px 32px",
        }}
      >
        <div style={{ fontFamily: SERIF, fontSize: 23 }}>
          This page doesn&apos;t exist.
        </div>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.65,
            color: "var(--sn-muted)",
            margin: "9px 0 16px",
          }}
        >
          It may have been deleted, or the link may be wrong.
        </p>
        {/* A navigation link wearing the canvas primaryBtn pill (an <a>, not
            a mutation button — no working state applies). */}
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            height: 34,
            padding: "0 16px",
            borderRadius: 100,
            background: "var(--sn-accent)",
            color: "var(--sn-on-accent)",
            fontFamily: SANS,
            fontSize: 12.5,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Back to briefings
        </Link>
      </div>
    </main>
  );
}
