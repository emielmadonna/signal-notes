// Sign-in page (P1, neutral shell — P2 restyles with the approved tokens).
// Server component: reads the URL params (?next=, ?reason=expired) and hands
// them to the client form, which does the actual auth call in the browser.
import type { Metadata } from "next";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = {
  title: "Sign in — Signal Notes",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Signal Notes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Briefings grounded in your own documents.
        </p>
        {params.reason === "expired" ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            You were signed out. Sign in to continue.
          </p>
        ) : null}
        <SignInForm next={params.next} />
      </div>
    </main>
  );
}
