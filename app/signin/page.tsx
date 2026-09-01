// Sign-in (DESIGN-SPEC §3 SIGN-IN; canvas signinWrap/signinLede/expiredBox).
// Server component: reads ?next= and ?reason=expired and hands them to the
// client form, which does the actual auth call in the browser.
import type { Metadata } from "next";
import { MarkIcon } from "@/components/ui-sn/icons";
import { MicroFaint } from "@/components/ui-sn/micro";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = {
  title: "Sign in — Signal Notes",
};

const SERIF = "var(--font-literata), Literata, Georgia, serif";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--sn-bg)",
        color: "var(--sn-text)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
        animation: "sn-fade .2s ease both",
      }}
    >
      <div style={{ width: "min(380px,100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <MarkIcon />
          <span
            style={{ fontFamily: SERIF, fontSize: 24, letterSpacing: "-.01em" }}
          >
            Signal Notes
          </span>
        </div>
        <p
          style={{
            fontFamily: SERIF,
            fontSize: 14.5,
            fontStyle: "italic",
            color: "var(--sn-muted)",
            margin: "9px 0 24px",
          }}
        >
          Briefings grounded in your own documents.
        </p>
        {params.reason === "expired" ? (
          <div
            role="status"
            style={{
              borderTop: "1px solid var(--sn-soft)",
              borderBottom: "1px solid var(--sn-soft)",
              padding: "12px 0",
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 13 }}>You were signed out.</div>
            <MicroFaint style={{ display: "block", marginTop: 3 }}>
              Sign in to continue where you left off.
            </MicroFaint>
          </div>
        ) : null}
        <SignInForm next={params.next} />
      </div>
    </main>
  );
}
