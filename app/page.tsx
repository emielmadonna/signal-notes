// The authenticated workspace at "/" (DESIGN-SPEC §2: one authenticated
// screen + sign-in). The middleware guards this route; the getUser() check
// below is the server-side backstop. The org name is fetched server-side
// with NAMED columns (constitution R2) through RLS, so a user can only ever
// see their own org.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/sign-out";
import { Workspace } from "@/components/workspace/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Signal Notes",
};

// "mara.ellison" → "Mara Ellison"; "mara" → "Mara" (spec D5: name derives
// from the signed-in user's email local-part).
function prettyNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._+-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Avatar initials from the pretty name: first letters of the first two
// words ("Mara Ellison" → "ME"); a single word gives its first two letters.
function initialsFromName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0] ?? "??").slice(0, 2).toUpperCase();
}

type MembershipRow = {
  org_id: string;
  organizations:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/signin?next=/");
  }

  // Real org name: org_members joined to organizations for the current
  // user, named columns only (R2). RLS already scopes rows to the caller.
  const { data: membership, error: orgFetchError } = await supabase
    .from("org_members")
    .select("org_id, organizations (id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle<MembershipRow>();

  const orgRelation = membership?.organizations ?? null;
  const org = Array.isArray(orgRelation) ? orgRelation[0] ?? null : orgRelation;

  // Surfaced, never swallowed: a failed fetch (or a user with no membership
  // row, which should not happen with seeded data) reads as an explicit
  // failure in the account menu — not as a blank.
  const orgError = orgFetchError
    ? orgFetchError.message
    : org
      ? null
      : "No workspace membership found for this account.";

  const email = user.email ?? "unknown@unknown";
  const displayName = prettyNameFromEmail(email);
  const params = await searchParams;

  return (
    <Workspace
      email={email}
      displayName={displayName}
      initials={initialsFromName(displayName)}
      orgName={org?.name ?? null}
      orgError={orgError}
      signOutError={params.error === "signout"}
      signOutAction={signOut}
    />
  );
}
