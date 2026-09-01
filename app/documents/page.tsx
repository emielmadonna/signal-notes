// Documents placeholder (P1). P3 owns the real list; this page only proves
// the session works end to end: it reads the user server-side, shows who is
// signed in, and offers sign-out. Neutral shell — P2 restyles.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PendingButton } from "@/components/pending-button";

export const metadata: Metadata = {
  title: "Documents — Signal Notes",
};

async function signOut() {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // Rule 3: the failure is surfaced to the UI, not swallowed.
    redirect("/documents?error=signout");
  }
  redirect("/signin");
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already guards this route; this is the server-side backstop.
  if (!user) {
    redirect("/signin?next=/documents");
  }

  const params = await searchParams;

  return (
    <main className="flex flex-1 flex-col bg-background px-6 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Signal Notes
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Signed in as {user.email}
            </p>
          </div>
          <form action={signOut}>
            <PendingButton variant="outline" pendingLabel="Signing out…">
              Sign out
            </PendingButton>
          </form>
        </header>
        {params.error === "signout" ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            Sign-out didn&apos;t complete. Try again.
          </p>
        ) : null}
        <p className="mt-10 text-sm text-muted-foreground">
          Documents arrive in the next phase.
        </p>
      </div>
    </main>
  );
}
