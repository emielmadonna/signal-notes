"use server";

// Sign-out server action — the same logic P1's documents page used, moved
// into its own module so the client-side account menu can call it.
// Rule 3: the { error } is checked and surfaced to the UI (?error=signout
// renders an alert in the workspace), never swallowed.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    redirect("/?error=signout");
  }
  redirect("/signin");
}
