// /documents/new — kept as a deep link (bookmarks, e2e, old references), but
// the ADD DOCUMENT sheet itself now mounts INSIDE the workspace so it overlays
// the live lists instead of a bare background. This route just hands off:
// /?add=1 opens the sheet over the workspace (components/workspace/workspace).
import { redirect } from "next/navigation";

export default function NewDocumentPage() {
  redirect("/?add=1");
}
