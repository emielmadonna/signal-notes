"use client";

// Document mutations (P3 card-009): rename, body edit, delete, and the
// audit line a title edit leaves behind. Every function returns
// { error: string | null } and NEVER throws (supabase-js doesn't throw;
// neither do we) — the caller MUST surface a non-null error in the UI (R3).
// Every select names its columns (R2). RLS scopes every statement to the
// caller's org (R1): a cross-org id simply matches zero rows, and zero
// rows is treated as a failure here, never as silent success.
import { createClient } from "@/lib/supabase/client";

/** "mara.ellison@acme.com" → "MARA.ELLISON" (audit actor display label). */
function actorLabel(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (local || email).toUpperCase();
}

/** Clamp one side of the audit detail so the trail line stays readable. */
function clip(text: string, max = 60): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Renames one document. Zero updated rows = failure, surfaced. */
export async function renameDocument(
  id: string,
  title: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ title })
    .eq("id", id)
    .select("id, updated_at"); // named columns (R2); proves a row changed
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Nothing was saved — the document may have been deleted." };
  }
  return { error: null };
}

/** Saves an edited body. Zero updated rows = failure, surfaced. */
export async function updateDocumentBody(
  id: string,
  body: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ body })
    .eq("id", id)
    .select("id, updated_at");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Nothing was saved — the document may have been deleted." };
  }
  return { error: null };
}

/**
 * Deletes the given documents in one statement. The returned row list is
 * checked against what was asked: zero rows deleted is a hard failure and a
 * partial delete is reported as one (with `deletedIds` naming what DID go,
 * so the caller can still prune those rows locally, R10).
 */
export async function deleteDocuments(
  ids: string[]
): Promise<{ error: string | null; deletedIds: string[] }> {
  if (ids.length === 0) return { error: "Nothing selected.", deletedIds: [] };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("documents")
    .delete()
    .in("id", ids)
    .select("id"); // named column (R2); proves rows actually went away
  if (error) return { error: error.message, deletedIds: [] };
  const deletedIds = (data ?? []).map((row: { id: string }) => row.id);
  if (deletedIds.length === 0) {
    return {
      error: "Nothing was deleted — the documents may already be gone.",
      deletedIds: [],
    };
  }
  if (deletedIds.length < ids.length) {
    return {
      error: `Only ${deletedIds.length} of ${ids.length} could be deleted — the rest may already be gone.`,
      deletedIds,
    };
  }
  return { error: null, deletedIds };
}

/** One FILE HISTORY row as the document sheet's rail reads it. */
export type DocumentAuditRow = {
  event: string;
  detail: string;
  actor: string;
  created_at: string;
};

/**
 * Appends the TITLE EDITED audit line for a rename (DESIGN-SPEC §4:
 * audit_events feeds FILE HISTORY). The actor label is the signed-in
 * user's email local-part, uppercased; actor_user_id is their verified id
 * (the RLS insert policy rejects anything else). Returns the inserted row
 * so the sheet can append it to the rail optimistically (R10).
 */
export async function auditTitleEdit(
  documentId: string,
  orgId: string,
  oldTitle: string,
  newTitle: string
): Promise<{ error: string | null; row: DocumentAuditRow | null }> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) return { error: userError.message, row: null };
  if (!user || !user.email) {
    return { error: "No signed-in user found.", row: null };
  }
  const { data, error } = await supabase
    .from("audit_events")
    .insert({
      org_id: orgId,
      document_id: documentId,
      event: "TITLE EDITED",
      detail: `${clip(oldTitle)} → ${clip(newTitle)}`,
      actor: actorLabel(user.email),
      actor_user_id: user.id,
    })
    .select("event, detail, actor, created_at"); // named columns (R2)
  if (error) return { error: error.message, row: null };
  const row = (data ?? [])[0] ?? null;
  if (!row) return { error: "The history line was not recorded.", row: null };
  return { error: null, row };
}

// ---------------------------------------------------------------------------
// Cross-route rename handoff (R10). The document sheet lives on its own
// route, so the workspace list is unmounted while a rename saves. The saved
// patch is parked here (module state survives client-side navigation) and
// the workspace drains it into updateDocumentInList the moment its document
// list is populated — the tile shows the new title even if that fetch raced
// the write or served a cached response, without refetching the world.
// ---------------------------------------------------------------------------

export type DocumentListPatch = { title?: string };

const pendingPatches = new Map<string, DocumentListPatch>();

/** Park a confirmed patch for the workspace list to apply on next mount. */
export function recordDocumentPatch(id: string, patch: DocumentListPatch): void {
  pendingPatches.set(id, { ...pendingPatches.get(id), ...patch });
}

/** Drain all parked patches (the workspace applies then discards them). */
export function takeDocumentPatches(): Array<[string, DocumentListPatch]> {
  const drained = Array.from(pendingPatches.entries());
  pendingPatches.clear();
  return drained;
}
