# SHIPLOG — Signal Notes

> This is a live diary: entries are written at the moment they happen, with real
> timestamps. Nothing here is reconstructed after the fact. Evidence files live
> in shiplog/evidence/ and are referenced by name.


## How this was built (harness disclosure)

I don't hand-type code. I built a review system before the clock started and
disclosed it here on purpose: work moves Dispatcher -> Builder -> Auditor ->
Change Card -> me. Every task requires proof-of-done (pasted output, live query,
screenshot); a separate auditor agent tries to reject every change; `npm run
constitution` gates every merge; and every claim below links to its evidence
file. The prompts, protocol, and verifier are all in this repo. Ask me anything
in the walkthrough and I'll show the proof rather than the vibes.

What was built before "go": my own generic tooling only (this template, the
constitution file, agent prompts, verifier skeleton, the design system prompts).
All Signal Notes application code, schema, and migrations: after "go".

---

## 1. What I verified, and how (per rule)

> Format per entry: the claim, the exact command/query, the pasted result or
> evidence filename, date. "Verified" means I (or my harness, which I ran)
> observed the result. Anything I did NOT verify is listed at the bottom of this
> section under ASSUMED, honestly.

### R1 — Tenant isolation (proven, not assumed)
- [x] 2026-09-01 02:54 — RLS enabled + at least one policy on every public
      table (7/7, 16 policies). Query: pg_class/pg_policies via the verifier
      (scripts/constitution.sh R1a). Output inside
      shiplog/evidence/constitution-20260901-025459.txt.
- [x] 2026-09-01 02:54 — Two-org probe: signed in as ana@northwind-advisory.test
      (Northwind Advisory) and marta@meridiangroup.test (Meridian Group); 16/16
      checks pass: cross-org selects on documents AND briefings return 0 rows;
      cross-org inserts rejected by RLS; cross-org update touches 0 rows;
      linking an own-org briefing to the other org's document, and writing a
      log line against the other org's briefing, are both rejected by the
      composite foreign keys with Postgres code 23503. Script:
      scripts/two-org-probe.ts (committed, runs inside the verifier and CI).
      Output: shiplog/evidence/r1-probe-20260901-025459.txt.
      Context: the probe's composite-FK checks exist because the auditor
      REJECTED the first migration draft for exactly that hole — catch #5/#6.
- [x] 2026-09-01 04:24 — Probe extended to 24 checks (12 per user) after
      migration 0002: briefing_notes and audit_events cross-org inserts
      rejected by composite FKs (code 23503), cross-org selects return 0 rows
      with the reader's own org first proven non-empty. Output:
      shiplog/evidence/r1-probe-20260901-042430.txt. The audit trail is
      tamper-evident by construction: inserts are pinned to the signed-in
      user (catch #14) and audit rows survive the deletion of their subjects
      (catch #15) — both holes caught in review BEFORE the migration was
      applied.

### R2 — No wildcard selects
- [ ] Verifier select-check output: evidence/r2-selects.txt

### R3 — Every write's { error } surfaced
- [ ] Verifier catch/error-check output + forced-failure screenshots per write:
      evidence/r3-*.png

### R4 — Migrations verified live
> One block PER migration file:
- [x] supabase/migrations/20260901000001_foundation.sql — committed in
      3b87d55 at 02:53, applied 02:54 via `supabase db push` (file first,
      database second), verified 02:54.
      migrations tracking row: `20260901000001 | foundation`
      information_schema.columns: all 7 tables present with every declared
      column (41 columns total, incl. briefings.model and
      generation_events.kind) — full paste in
      shiplog/evidence/r4-migration-0001-verified-20260901.txt.
      Also on file: the ghost-migration detector FAILING before the apply
      (constitution-20260901-023502.txt) and PASSING after
      (constitution-20260901-025459.txt) — the gate works in both directions.
      Related: shiplog/evidence/r4-blank-project-proof-20260901.txt (catch #4:
      the pre-connected production database this build refused to touch).
- [x] supabase/migrations/20260901000002_canvas_schema.sql — committed then
      applied 04:23 via `supabase db push`, verified 04:23.
      tracking rows: `20260901000001 | foundation`, `20260901000002 |
      canvas_schema`. information_schema: all new columns live (documents
      file_name/ext/size_bytes; briefings sections/word_count/citation_count;
      briefing_notes 7 cols; audit_events 9 cols incl. actor_user_id);
      backfill verified (ext WEB×2/TXT×10, size_bytes 1075-1251 bytes); RLS
      true + policies on both new tables. Full paste:
      shiplog/evidence/r4-migration-0002-verified-20260901.txt.

### R5 — Prompts in one module
- [ ] Verifier inline-prompt check: evidence/r5-prompts.txt

### R6 — Grounding displayed
- [ ] Screenshot: briefing view with sources panel: evidence/r6-grounding.png

### R7 — Feedback stored
- [ ] Rated + annotated in UI, then queried the row: [paste] evidence/r7-feedback.txt

### R8 — Narrated generation
- [ ] Mid-generation screenshot of activity log: evidence/r8-narration.png

### R9 — Aborts + honest non-2xx
- [ ] Forced 500 on list fetch: error state screenshot (distinct from empty):
      evidence/r9-error-state.png
- [ ] Abort-on-unmount: [how verified]

### R10 — Loading states + optimistic updates
- [ ] Screen recording of edit flow: evidence/r10-edit.mp4 (or gif)

### ASSUMED, not verified
- [honesty section: list anything you didn't get to, and what it would take]

---

## 2. What the AI got wrong, and how I caught it

> Distilled from docs/catch-log.md (full log committed). Format: CLAIM / VICTIM
> (the concrete failure it would have caused) / THE CATCH (the act + evidence) /
> FIX + SYSTEM CHANGE. Strongest 3-4 below; the raw log has all of them.

### Catch 1
- CLAIM:
- VICTIM:
- THE CATCH:
- FIX + SYSTEM CHANGE:

### Catch 2
### Catch 3
### Catch 4

---

## 3. The rule I'd push back on

> One rule, a real argument, and the condition under which I'd still follow it.

---

## 4. What I'd do with another week

> Ranked, with the why. Not a feature wishlist: what the system needs next.
