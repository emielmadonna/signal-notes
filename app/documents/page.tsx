// P1's documents page is now the workspace at "/" (DESIGN-SPEC §2: one
// authenticated screen). This permanent redirect keeps every old /documents
// link alive; the sign-out flow it used to own lives in
// app/actions/sign-out.ts.
import { permanentRedirect } from "next/navigation";

export default function DocumentsRedirect() {
  permanentRedirect("/");
}
