"use client";

// Briefing mutations (card-012): the FEEDBACK SEAM (rule 7) and section-level
// margin NOTES for the reading view, plus the append-only audit lines those
// two actions leave behind (rule 6's glass box stays honest end to end).
//
// Every function returns { error: string | null } (and, where the UI renders
// the result, the row too) and NEVER throws — supabase-js doesn't throw, so
// neither do we; the caller MUST surface a non-null error (R3). Every select
// names its columns (R2). RLS scopes every statement to the caller's org (R1):
// a cross-org id simply matches zero rows, treated here as a failure, never as
// silent success.
import { createClient } from "@/lib/supabase/client";

export type Rating = "up" | "down";

/** "ana.ruiz@northwind.test" → "ANA.RUIZ" (audit actor display label). */
function actorLabel(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (local || email).toUpperCase();
}

/** Clamp one side of an audit/notes detail so the line stays readable. */
function clip(text: string, max = 60): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// The signed-in user (id + email). auth.users itself is not client-readable,
// but the caller can always read their OWN identity from the session; that is
// the only identity these writes ever sign, exactly as the RLS policies demand
// (user_id / actor_user_id = auth.uid()).
// ---------------------------------------------------------------------------

type Me = { id: string; email: string | null };

async function currentUser(): Promise<{ me: Me | null; error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return { me: null, error: error.message };
  if (!user) return { me: null, error: "No signed-in user found." };
  return { me: { id: user.id, email: user.email ?? null }, error: null };
}

// ---------------------------------------------------------------------------
// FEEDBACK (rule 7): YOUR JUDGMENT — up / down, one row per (briefing, user).
// The unique constraint on (briefing_id, user_id) lets a re-rate be a single
// upsert (insert-or-update the rating in place) rather than a read-then-write
// race; the feedback_insert + feedback_update RLS policies both require the row
// to be the caller's own, inside their own org.
// ---------------------------------------------------------------------------

/**
 * Upserts the caller's rating for one briefing. Conflict target is the
 * (briefing_id, user_id) unique index — on conflict the existing row's rating
 * (and updated_at) is overwritten, so thumb-up → thumb-down just flips it. The
 * returned row proves a row actually landed; zero rows is surfaced as failure.
 */
export async function saveFeedback(
  briefingId: string,
  orgId: string,
  rating: Rating
): Promise<{ error: string | null }> {
  const { me, error: meError } = await currentUser();
  if (meError || !me) return { error: meError ?? "No signed-in user found." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("briefing_feedback")
    .upsert(
      {
        briefing_id: briefingId,
        org_id: orgId,
        user_id: me.id,
        rating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "briefing_id,user_id" }
    )
    .select("rating"); // named column (R2); proves a row landed
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Your rating wasn't saved — please try again." };
  }
  return { error: null };
}

/**
 * Reads the caller's OWN rating for a briefing (null when they haven't rated).
 * Used on load so the rated state survives a reload (rule 7). RLS + the
 * user_id filter keep this to the caller's single row.
 */
export async function fetchMyFeedback(
  briefingId: string,
  signal: AbortSignal
): Promise<{ rating: Rating | null; error: string | null }> {
  const { me, error: meError } = await currentUser();
  if (meError || !me) return { rating: null, error: meError };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("briefing_feedback")
    .select("rating")
    .eq("briefing_id", briefingId)
    .eq("user_id", me.id)
    .abortSignal(signal)
    .maybeSingle<{ rating: Rating }>();
  if (error) return { rating: null, error: error.message };
  return { rating: data?.rating ?? null, error: null };
}

// ---------------------------------------------------------------------------
// NOTES (margin comments): per-briefing, per-section. No UPDATE policy exists
// on purpose (edit = delete + re-add), so this file offers add + delete only.
// ---------------------------------------------------------------------------

/** One margin note as the reading view renders it. */
export type BriefingNoteRow = {
  id: string;
  user_id: string;
  section_index: number;
  body: string;
  created_at: string;
};

/**
 * Fetches every margin note on a briefing (org-scoped by RLS), oldest first.
 * The reader sees all notes in their org; only their own carry a Delete
 * control (enforced below and by the delete policy).
 */
export async function fetchNotes(
  briefingId: string,
  signal: AbortSignal
): Promise<{ rows: BriefingNoteRow[]; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("briefing_notes")
    .select("id, user_id, section_index, body, created_at")
    .eq("briefing_id", briefingId)
    .order("created_at", { ascending: true })
    .abortSignal(signal);
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as BriefingNoteRow[], error: null };
}

/**
 * Adds one margin note under the caller's own name, inside their own org
 * (both required by the insert policy). Returns the inserted row so the view
 * can render it optimistically (R10). Zero rows back = surfaced failure.
 */
export async function addNote(
  briefingId: string,
  orgId: string,
  sectionIndex: number,
  body: string
): Promise<{ row: BriefingNoteRow | null; error: string | null }> {
  const clean = body.trim();
  if (!clean) return { row: null, error: "A note can't be empty." };

  const { me, error: meError } = await currentUser();
  if (meError || !me) return { row: null, error: meError ?? "No signed-in user found." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("briefing_notes")
    .insert({
      briefing_id: briefingId,
      org_id: orgId,
      user_id: me.id,
      section_index: sectionIndex,
      body: clean,
    })
    .select("id, user_id, section_index, body, created_at"); // named (R2)
  if (error) return { row: null, error: error.message };
  const row = ((data ?? [])[0] ?? null) as BriefingNoteRow | null;
  if (!row) return { row: null, error: "The note wasn't saved — please try again." };
  return { row, error: null };
}

/**
 * Deletes one of the caller's own notes. The delete policy already restricts
 * this to the caller's own rows inside their org; the returned row list proves
 * a row actually went away, so an RLS-silenced no-op can never look like a
 * successful delete.
 */
export async function deleteNote(id: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("briefing_notes")
    .delete()
    .eq("id", id)
    .select("id"); // named column (R2); proves a row went away
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Nothing was deleted — the note may already be gone." };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// AUDIT lines for the two actions above (DESIGN-SPEC §4: RATED + NOTE feed the
// AUDIT TRAIL). These are best-effort companions to the primary write: their
// failure is surfaced as a soft warning by the caller and never un-does the
// rating/note that already saved. The actor label is the caller's own email
// local-part; actor_user_id is their verified id (the insert policy rejects
// anything else — a user can neither forge SYSTEM nor sign another name).
// ---------------------------------------------------------------------------

/** One AUDIT TRAIL row as the reading view renders it. */
export type BriefingAuditRow = {
  event: string;
  detail: string;
  actor: string;
  created_at: string;
};

async function appendAudit(
  briefingId: string,
  orgId: string,
  event: string,
  detail: string
): Promise<{ row: BriefingAuditRow | null; error: string | null }> {
  const { me, error: meError } = await currentUser();
  if (meError || !me || !me.email) {
    return { row: null, error: meError ?? "No signed-in user found." };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("audit_events")
    .insert({
      org_id: orgId,
      briefing_id: briefingId,
      event,
      detail,
      actor: actorLabel(me.email),
      actor_user_id: me.id,
    })
    .select("event, detail, actor, created_at"); // named columns (R2)
  if (error) return { row: null, error: error.message };
  const row = ((data ?? [])[0] ?? null) as BriefingAuditRow | null;
  if (!row) return { row: null, error: "The history line was not recorded." };
  return { row, error: null };
}

/** RATED audit line (companion to saveFeedback). */
export function auditRated(
  briefingId: string,
  orgId: string,
  rating: Rating
): Promise<{ row: BriefingAuditRow | null; error: string | null }> {
  return appendAudit(
    briefingId,
    orgId,
    "RATED",
    rating === "up" ? "Rated useful" : "Rated not useful"
  );
}

/** NOTE audit line (companion to addNote). */
export function auditNote(
  briefingId: string,
  orgId: string,
  sectionHead: string,
  body: string
): Promise<{ row: BriefingAuditRow | null; error: string | null }> {
  return appendAudit(
    briefingId,
    orgId,
    "NOTE",
    `“${clip(body, 40)}” on ‘${clip(sectionHead, 30)}’`
  );
}
