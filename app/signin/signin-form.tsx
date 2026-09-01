"use client";

// Email + password sign-in form using the browser Supabase client
// (anon key only — constitution hard boundary). Rule 3: the auth call's
// { error } is surfaced inline in human English and the form stays filled.
// Rule 10: the submit button has a working state while the call is pending.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Anti-open-redirect guard for ?next=. A startsWith("/") check is not enough:
// browsers treat "\" as "/" ("/\evil.com" => "//evil.com") and strip tabs and
// newlines while parsing ("/<tab>/evil.com" => "//evil.com"). So we let the
// URL parser resolve the value against our own origin and only navigate if
// the resolved origin is still ours; anything else (including parse failures)
// falls back to /documents.
function safeNextPath(next: string | undefined): string {
  if (!next) return "/documents";
  try {
    const u = new URL(next, window.location.origin);
    if (u.origin === window.location.origin) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    // Unparseable value: fall through to the safe default.
  }
  return "/documents";
}

export function SignInForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          ? "That email and password don't match. Check them and try again."
          : `Sign-in failed: ${signInError.message}`
      );
      setPending(false);
      return;
    }

    // Full navigation so the server sees the fresh session cookies.
    window.location.assign(safeNextPath(next));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
