"use client";

// /documents/new — the ADD DOCUMENT sheet on its own route (card-008).
// Renders the default-width (740) sheet over the app background; closing
// (scrim click, Escape, ✕) or a successful save returns to the workspace
// at "/", whose lists refetch on mount. The optimistic-prepend seam
// (useWorkspaceData().addDocumentToList) is for the dispatcher to wire when
// this sheet is mounted inside the workspace itself.
import { useRouter } from "next/navigation";
import { AddDocumentSheet } from "@/components/add-document/add-document-sheet";

export default function NewDocumentPage() {
  const router = useRouter();
  const goHome = () => router.push("/");

  return (
    <main style={{ minHeight: "100dvh", background: "var(--sn-bg)" }}>
      <AddDocumentSheet onClose={goHome} onSaved={goHome} />
    </main>
  );
}
