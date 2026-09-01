// DEV-ONLY DESIGN GALLERY (P2 card-5a screenshot target).
// This page exists so every ui-sn primitive can be eyeballed and
// screenshotted against the approved canvas in both themes. It is NOT a
// product surface: it SHIPS with P2 as the card's screenshot target and is
// DELETED IN P5 HARDENING.
// Auth-protected like everything else: middleware guards it, and this
// server-side backstop re-checks the session.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DesignGallery } from "./gallery";

export const metadata: Metadata = {
  title: "Design gallery — Signal Notes",
};

export default async function DesignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already guards this route; this is the server-side backstop.
  if (!user) {
    redirect("/signin?next=/design");
  }

  return <DesignGallery />;
}
