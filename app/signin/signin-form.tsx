"use client";

// Email + password sign-in form, restyled to the canvas (microLabel EMAIL/
// PASSWORD, underline fields, danger error rule, full-width accent submit)
// while keeping ALL of P1's logic: the browser Supabase client (anon key
// only — constitution hard boundary), the anti-open-redirect ?next= guard,
// rule 3 error surfacing, and the rule-10 working state.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PrimaryButton } from "@/components/ui-sn/buttons";
import { MicroFaint, MicroLabel } from "@/components/ui-sn/micro";

const SANS = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";

// Anti-open-redirect guard for ?next=. A startsWith("/") check is not enough:
// browsers treat "\" as "/" ("/\evil.com" => "//evil.com") and strip tabs and
// newlines while parsing ("/<tab>/evil.com" => "//evil.com"). So we let the
// URL parser resolve the value against our own origin and only navigate if
// the resolved origin is still ours; anything else (including parse failures)
// falls back to the workspace at "/".
function safeNextPath(next: string | undefined): string {
  if (!next) return "/";
  try {
    const u = new URL(next, window.location.origin);
    if (u.origin === window.location.origin) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    // Unparseable value: fall through to the safe default.
  }
  return "/";
}

// The canvas splits the failure into a title line and a helper line; any
// non-credential failure keeps its real message (rule 3: surfaced, never
// rewritten into something prettier than the truth).
type SignInError =
  | { kind: "credentials" }
  | { kind: "other"; message: string };

const underlineField = (danger: boolean): React.CSSProperties => ({
  display: "block",
  width: "100%",
  border: 0,
  borderBottom: `1px solid ${danger ? "var(--sn-danger)" : "var(--sn-border)"}`,
  borderRadius: 0,
  background: "transparent",
  color: "var(--sn-text)",
  padding: "8px 0",
  fontSize: 14,
  fontFamily: SANS,
  outline: 0,
});

export function SignInForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Surface the failure in human English; the fields keep their values.
      setError(
        signInError.message === "Invalid login credentials"
          ? { kind: "credentials" }
          : { kind: "other", message: signInError.message }
      );
      setPending(false);
      return;
    }

    // Full navigation so the server sees the fresh session cookies.
    window.location.assign(safeNextPath(next));
  }

  return (
    <form onSubmit={handleSubmit}>
      <label style={{ display: "block" }}>
        <MicroLabel style={{ display: "block" }}>EMAIL</MicroLabel>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={underlineField(false)}
        />
      </label>
      <label style={{ display: "block", marginTop: 18 }}>
        <MicroLabel style={{ display: "block" }}>PASSWORD</MicroLabel>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            ...underlineField(error !== null),
            letterSpacing: ".2em",
          }}
        />
      </label>
      {error ? (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: 10,
            marginTop: 10,
            animation: "sn-line .2s ease both",
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
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--sn-danger)",
              }}
            >
              {error.kind === "credentials"
                ? "That email and password don't match."
                : "Sign-in failed."}
            </div>
            {error.kind === "credentials" ? (
              <MicroFaint style={{ display: "block", marginTop: 2 }}>
                Check the password and try again.
              </MicroFaint>
            ) : (
              // A real failure message must stay readable as written —
              // no uppercase micro treatment for arbitrary error text.
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--sn-muted)",
                  marginTop: 2,
                  lineHeight: 1.5,
                }}
              >
                {error.message}
              </div>
            )}
          </div>
        </div>
      ) : null}
      <PrimaryButton
        type="submit"
        working={pending}
        workingLabel="Signing in…"
        style={{
          width: "100%",
          justifyContent: "center",
          height: 38,
          marginTop: 24,
          fontSize: 13,
        }}
      >
        Sign in
      </PrimaryButton>
    </form>
  );
}
