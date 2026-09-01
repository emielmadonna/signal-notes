# SHIPLOG — Signal Notes

**Production: https://signal-notes-three.vercel.app** (the stable alias; it
always points at the newest production deploy of `main`).

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
      Output: shiplog/evidence/r1-probe-final-24checks.txt (canonical committed
      run; per-run timestamped copies are gitignored as transient).
      Context: the probe's composite-FK checks exist because the auditor
      REJECTED the first migration draft for exactly that hole — catch #5/#6.
- [x] 2026-09-01 — Probe extended to 24 checks (12 per user) after
      migration 0002: briefing_notes and audit_events cross-org inserts
      rejected by composite FKs (code 23503), cross-org selects return 0 rows
      with the reader's own org first proven non-empty. Output:
      shiplog/evidence/r1-probe-final-24checks.txt. The audit trail is
      tamper-evident by construction: inserts are pinned to the signed-in
      user (catch #14) and audit rows survive the deletion of their subjects
      (catch #15) — both holes caught in review BEFORE the migration was
      applied.

### R2 — No wildcard selects
- [x] Enforced mechanically every run: scripts/constitution.sh R2 greps app +
      components + lib for `.select("*")` / empty `.select()` and FAILs with
      file:line on any hit. Latest run: `PASS R2 no select("*") or empty
      select()` — see the newest shiplog/evidence/constitution-*.txt. Every
      committed query names its columns (incl. nested PostgREST joins).

### R3 — Every write's { error } surfaced
- [x] Enforced two ways: (1) scripts/constitution.sh R3 FAILs on any empty
      `catch {}`, and R3b/R3c WARN on writes/comment-only catches for the
      auditor to confirm — every such WARN was discharged in review (each write
      destructures and checks `{ error }`). (2) Forced-failure UI proof: the
      P5 sweep injects 500s and asserts the error state renders distinct from
      empty (never a fake success) — shiplog/evidence/p5-failures/*.png.

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
- [x] Verifier R5 PASS + a second check R5b added (catch #18) that hunts
      second-person/imperative model-directive strings in lib/ai + app/api —
      the class the R5 grep couldn't see. Both green. lib/prompts/briefing.ts
      is the single home; BRIEFING_PROMPT_VERSION versions it.

### R6 — Grounding displayed
- [x] Reading view GROUNDED-IN chips + per-citation tooltips showing the exact
      source passage. shiplog/evidence/p4-live/reading-view.png,
      citation-tooltip.png. Independently DB-verified: all 19 citations on the
      real briefing resolve to their 3 named sources, each quote a genuine
      substring (server-verified at generation, unverified quotes dropped).

### R7 — Feedback stored
- [x] Rated "Useful" in the browser → briefing_feedback row persisted (rating
      'up') and survives reload. shiplog/evidence/p4-live/feedback-rated.png +
      the live E2E "feedback persists" test.

### R8 — Narrated generation
- [x] Mid-run activity log: real status/thinking/tool_call events + streaming
      body, no bare spinner. shiplog/evidence/p4-live/generation-midstream.png,
      generation-complete.png. Events are persisted rows, replayed on reopen.

### R9 — Aborts + honest non-2xx
- [x] Forced-500 on the list fetch renders the error state (distinct from
      empty), and a bad id renders not-found — E2E p5-failures. Client fetches
      abort on unmount (AbortController in the data hooks + generation stream).
      evidence/p5-* (from the P5 sweep).

### R10 — Loading states + optimistic updates
- [x] Working states on every mutation button (shared component); optimistic
      list add/rename/delete + rating with revert-on-error. E2E p3-documents
      (rename → SAVED + optimistic tile; delete → tile gone) + p4 feedback.

### ASSUMED, not verified (honest)
- AUTHOR NAMES: documents/briefings store an auth.users id, which is not
  client-queryable and there is no org-scoped profiles table, so tile meta and
  briefing meta omit the author name rather than invent or force a forbidden
  join. A profiles table is the fix (see section 4).
- FEEDBACK has no "un-rate": briefing_feedback has no delete policy, so a
  rating can be flipped but not removed. Deliberate (the design offers no
  un-rate control).
- OPTIMISTIC RATING is not awaited before the UI updates; a reload within ~1s
  of clicking can race the write. Fine in normal use; a stricter await-before-
  paint would close it.
- WEB-URL SSRF: the fetch-url guard blocks literal private/loopback/metadata
  hosts and re-validates each redirect hop, but DNS-rebinding (a public host
  that resolves to a private IP at connect time) is not defended — low risk on
  Vercel serverless, real if self-hosted.
- CLIENT-DISCONNECT DURABILITY: the generation run persists every event before
  forwarding and is not aborted on disconnect, so the DB + events-replay route
  are the real guarantee; true Vercel serverless freeze-on-disconnect semantics
  under load were reasoned through, not stress-tested.
- MODELS: only claude-sonnet-5 was exercised end-to-end live; the opus-5 and
  haiku-4-5 allowlist paths are covered by types + server validation, not a
  live run each.
- PDF page markers: pdf-parse leaves "-- N of M --" markers in extracted
  bodies; harmless to storage, but a briefing could theoretically quote one.
- CITATION VERIFICATION proves PRESENCE, not SUPPORT: each stored citation quote
  is confirmed to be a real substring of its named source document (so no quote
  is fabricated), but the check does not prove the quote actually supports the
  sentence it's attached to, and a very short quote can match trivially. The
  glass box guarantees "this text is really in that document," not "this is the
  right evidence for this claim" — that remains human judgment (which is what
  the feedback seam is for). Flagged by Mock-Wren round 2.

---

## 2. What the AI got wrong, and how I caught it

> Distilled from docs/catch-log.md (full log committed). Format: CLAIM / VICTIM
> (the concrete failure it would have caused) / THE CATCH (the act + evidence) /
> FIX + SYSTEM CHANGE. Strongest 4-5 below; the raw log has all of them.

These five are the strongest of 25 logged catches (full raw log:
docs/catch-log.md). Each has a real victim, a distinct failure class, and left
a gate behind so it cannot recur silently.

### Catch 1 — The build almost ran against a live production database (#4)
- CLAIM: the Supabase connection wired into the tooling was Signal Notes'.
- VICTIM: a real production database for a DIFFERENT product — ~300 applied
  migrations, live campaign/billing/contact data, its own "organizations"
  table. Applying migration 0001 there would have collided with production
  schema and stamped our RLS onto another product's tables.
- THE CATCH: before any write, I ran read-only list_migrations/list_tables and
  saw the foreign history. Zero writes were sent. Evidence:
  shiplog/evidence/r4-wrong-project-tables-*.txt + blank-project-proof.
- FIX + SYSTEM CHANGE: a fresh blank project was created for Signal Notes and
  its ref PINNED in supabase/PROJECT_REF; the verifier now refuses any DB
  check whose link or DATABASE_URL isn't that project. The build can no longer
  point at the wrong database.

### Catch 2 — Cross-organization data leak wired into the schema (#5)
- CLAIM: "org-scoped RLS on every table; tenant isolation proven."
- VICTIM: every organization's data — a member of org A could attach org B's
  document to their briefing, or hang forged child rows off org B's briefings,
  because the child-table INSERT policies checked only the row's own org_id
  while foreign keys bypass RLS. The worst class of multi-tenant bug.
- THE CATCH: the adversarial auditor read all 18 policies against rule 1 and
  found the gap BEFORE the migration was applied. The two-org probe was then
  extended to attack exactly this.
- FIX + SYSTEM CHANGE: composite foreign keys (id, org_id) force the database
  itself to reject a child whose parent belongs to another org; the committed
  probe now proves it live (rejection code 23503), and it runs in CI on every
  push — not once by hand.

### Catch 3 — An audit trail anyone could forge, and that erased itself (#14/#15)
- CLAIM: audit_events is the append-only accountability trail.
- VICTIM: the trail's own trustworthiness — actor was free text with only
  org-membership checked, so any member could write lines under a colleague's
  name or as "SYSTEM"; and both foreign keys cascaded, so deleting a briefing
  would purge its own history exactly when it mattered most.
- THE CATCH: the auditor noticed the inconsistency (every other writable table
  pinned identity to the signed-in user; this one didn't) and read the cascade
  rules against the file's own "nobody can make it disappear" comment.
- FIX + SYSTEM CHANGE: inserts are pinned to the signed-in user (actor_user_id
  = auth.uid()), SYSTEM rows are server-only, and audit rows survive deletion
  of their subject (on delete set null). Both fixed before apply.

### Catch 4 — Prompt strings hiding in the engine, invisible to review (#18)
- CLAIM: "every word the model reads lives in lib/prompts and NOWHERE ELSE"
  (the prompt file's own header); verifier R5 PASS.
- VICTIM: the operations-review surface rule 5 protects — three model-facing
  instruction strings sat inline in the engine, unversioned, and the R5 grep
  heuristic structurally could not see them, so its green was misleading.
- THE CATCH: the auditor read the engine line by line and found the strings the
  automated check missed.
- FIX + SYSTEM CHANGE: the strings moved to versioned constants in
  lib/prompts/, AND the verifier gained a new check (R5b) that hunts
  second-person/imperative model-directive strings in the engine and API
  handlers — so the whole class is now caught mechanically, not just by eye.

### Catch 5 — "We don't have the source" was a claim nobody tested (#25)
- CLAIM: PART-B.md, in a banner, in bold: "BLOCKED ON SOURCE MATERIAL — not
  yet executable, and deliberately not fabricated… That PR is not in this
  workspace" — the refusal framed as the constitution's own integrity rule.
- VICTIM: a graded deliverable sat unexecuted for the entire build while the
  campaigns PR it needed was quoted in full in the founding brief, in our
  possession since day zero. Worse than a missing file, because the excuse was
  persuasive: it would have scored as missing work dressed up as integrity.
- THE CATCH: external review — Emiel's mock-Wren round read the ORIGINAL BRIEF
  against the deliverables folder instead of the deliverables against each
  other. No agent in this repo caught it across two mock-Wren rounds and
  twenty-four prior catches, because every internal review took "the PR is not
  in the workspace" as a premise instead of a claim to test.
- FIX + SYSTEM CHANGE: the PR is committed verbatim (deliverables/
  PART-B-SOURCE.md, sha256-pinned, diffable against every Part B quote) and
  Part B is executed against it for real. The system change is an intake rule
  in CLAUDE.md: every inbound document is split ON ARRIVAL into INSTRUCTIONS
  and SOURCE MATERIAL, and the source material is filed in the repo on day
  zero. We had a rule against claiming what we hadn't observed — and no rule
  against failing to observe what we already had. "I don't have it" needs
  evidence like any other claim.

---

## 3. The rule I'd push back on

The rule I'd argue with is **#10's "update local state optimistically instead
of refetching the world."** First, the honest concession, because it's the fair
hit: rule 10 done *correctly* means optimistic-WITH-rollback — paint the change,
keep the server's answer, revert and surface on error — and that is exactly what
rule 3 asks for. Read that way, there's no contradiction, and our real defect
wasn't the rule: it was ONE un-awaited feedback upsert that painted "YOU RATED
THIS USEFUL" before the write settled, so a reload within ~1s could have shown
success for a save still in flight. That's a bug in one call, not a flaw in the
principle.

So my pushback is narrower and, I think, still real: the rule's wording —
"optimistic INSTEAD OF refetching" — reads as a blanket default, and a blanket
default is what invited that un-awaited write to look rule-compliant. The tension
isn't optimism-vs-correctness in general; it's that "always optimistic" quietly
licenses painting success before the system knows, on writes where that matters.

My argument: for MUTATIONS THAT CARRY REAL CONSEQUENCE (a delete, a generation,
anything another person will rely on), I'd rather show a brief working state and
confirm on the server's answer than paint success first and reconcile later.
Optimism should be reserved for cheap, low-stakes, easily-reverted edits (a
title rename, a selection toggle).

The condition under which I'd still follow it as written: when the write is
genuinely idempotent and the revert-on-error path is itself tested to fire and
be visible — which is exactly what we required in review. So I don't want the
rule deleted; I want it to say "optimistic where the stakes and the revert path
justify it," not "optimistic instead of refetching" as a blanket default.

---

## 4. What I'd do with another week

Ranked by what the SYSTEM needs next, not features:

1. A PROFILES table (org-scoped: user_id, email, display name). Three honest
   gaps trace to auth.users being unqueryable from the client — author names on
   documents/briefings, real actor names on notes, the "added by" meta. One
   small table closes all three and removes an ASSUMED-list cluster.
2. HARDEN THE STREAM'S DURABILITY CONTRACT. The run persists every event and
   survives client disconnect by design, but I'd add a background finalizer
   (so a serverless freeze mid-run can't strand a 'generating' row forever) and
   a real disconnect-under-load test, turning a reasoned guarantee into a
   proven one.
3. AWAIT-BEFORE-PAINT for consequential writes (section 3): make the feedback/
   note path confirm server success before the durable "saved" state, keeping
   optimism only for the cheap edits.
4. WIDEN THE LIVE MODEL COVERAGE: run opus-5 and haiku-4-5 end-to-end in CI on
   a schedule, not just sonnet-5, so a provider-side change to either path is
   caught by the gate rather than by a user.
5. DEFEND DNS-REBINDING on fetch-url (resolve-then-pin the IP, or an egress
   allowlist) if this ever leaves Vercel's serverless network.

---

## 5. Post-merge: the upload defect Emiel found, and the finish of a run

Emiel reported three things from live use: uploads failing with 500s, only a
narrow set of file types accepted, and briefings that "never finish in a timely
manner". All three are fixed; two of them were real defects a green test suite
had been hiding.

### 5.1 The 500 (catch #23) — reproduced before it was fixed

The upload suite was green because its four fixtures were clean ASCII. Real
documents are not. Posting real bytes at the live route reproduced the failure
twice, verbatim from the server:

    RESULT 500 | nul-byte.txt       | {"error":"Saving the document failed:
                                      unsupported Unicode escape sequence.
                                      Nothing was added."}
    RESULT 500 | lone-surrogate.rtf | {"error":"Saving the document failed:
                                      Empty or invalid json. Nothing was added."}

Cause, both cases, at the insert:

  * A Postgres `text` value physically cannot contain U+0000. pdf.js emits one
    for every glyph with no Unicode mapping, which is routine in CID-font PDFs.
  * An unpaired surrogate breaks `JSON.stringify`, so the request body never
    parses. RTF's `\uN` escape and pdf.js's UTF-16 handling both produce them.

Fix: `lib/ingest/sanitize.ts`, applied on all three paths that write
`documents.body` — the upload route, the fetch-url route, and the paste path in
the add-document sheet. Pinned by `tests/sanitize.test.ts` (9 assertions,
including the JSON round-trip) and by `e2e/p6-ingestion.spec.ts`, which posts
both original reproductions at the live route and reads the stored text back.

### 5.2 What we accept (catch #24)

The old route knew five extensions and its 415 message stated them as the limit
of what is possible. It was the limit of what was implemented. Accepted now:

| Strategy | Formats |
|---|---|
| pdf-parse | PDF |
| mammoth | DOCX |
| RTF stripper | RTF |
| HTML → text | HTML, HTM, XHTML |
| UTF-8 text | TXT, TEXT, LOG, MD, MARKDOWN, MDX, CSV, TSV, JSON, JSONL, NDJSON, XML, YAML, YML, SRT, VTT |

A file with **no extension** is now classified by its bytes (`%PDF`, `PK\x03\x04`,
`{\rtf`, or "does this decode as text") instead of refused — that is what an
email attachment or a browser download usually looks like on disk. A format we
genuinely cannot read gets a named way out ("Word's older .doc format can't be
read directly. Open it in Word and save it as .docx") rather than a generic no.

The accepted set is one table, `lib/ingest/file-types.ts`. The drop zone's
`accept` attribute, the text under the icons, and the route's refusal message
are all generated from it, so they cannot drift apart.

### 5.3 Migration 0004 — live verification (R4)

0003 (the hardening pass) was committed but unapplied; 0004 widens
`documents_ext_check` to the labels the table above can emit. Both applied via
`supabase db push --linked`. Live results:

    $ select version, name from supabase_migrations.schema_migrations order by version
    20260901000001  foundation
    20260901000002  canvas_schema
    20260901000003  hardening
    20260901000004  document_types

    $ select conname, pg_get_constraintdef(oid) from pg_constraint
        where conrelid='public.documents'::regclass and conname='documents_ext_check'
    documents_ext_check  CHECK ((ext = ANY (ARRAY['PDF'::text, 'DOCX'::text,
      'RTF'::text, 'HTML'::text, 'TXT'::text, 'MD'::text, 'CSV'::text,
      'TSV'::text, 'JSON'::text, 'XML'::text, 'YAML'::text, 'LOG'::text,
      'SRT'::text, 'VTT'::text, 'WEB'::text])))

`tests/file-types.test.ts` asserts the code's label set against that SQL list, so
a future format added to one and not the other fails a unit test instead of
becoming a 500.

### 5.4 The end of a run

Three changes, smallest first:

1. **The reading view opens with the generation log COLLAPSED.** It was expanded
   by default, so a finished briefing greeted its reader with the machine's
   narration instead of the briefing. Rule 8 is about the work narrating itself
   *while it runs* — that is the generation surface's job. Here the replay is
   evidence, one click away, with every persisted line intact.
2. **A finished run opens the briefing itself.** The surface reached COMPLETE
   and then waited for someone to notice a button. A 900 ms beat lets the
   COMPLETE stamp and the last log line land, then the reading view takes over;
   leaving early cancels the hand-off, and the button remains for anyone who
   beats the timer or returns to a finished run.
3. **The client no longer cancels the stream that keeps the run alive.**
   `startGeneration` used to `cancel()` the POST response body immediately. That
   response stream is what holds the serverless invocation open, so the platform
   was free to reclaim the function mid-run: the briefing stayed `generating`
   forever, the events route tailed a log that never grew until its 285 s
   deadline, and the user watched a run that genuinely never finished. It now
   drains the body in the background instead — one idle socket for the length of
   the run, and the difference between "you can close this, the run keeps going"
   being a promise and being true.

This is the failure mode §4.2 flagged as the next thing to harden. It is now
closed from the client side; a server-side background finalizer for a genuine
platform freeze is still the right belt-and-braces and stays on that list.

### 5.5 Gate

    PASS   R2 / R3 / R3b / R3c / R5b        PASS   R4 migrations 0001-0004 applied
    PASS   KEY (service-role, Anthropic)    PASS   R1a RLS on every table
    PASS   R1b two-org probe (24/24)        PASS   typecheck / lint
    PASS   unit tests (47)                  PASS   e2e suite (50 passed, 1 skipped)
    PASS   CONSTITUTION: all checks green

Evidence: `shiplog/evidence/p6-constitution-green.txt`,
`shiplog/evidence/r1-probe-p6-24checks.txt`, `shiplog/evidence/p6-ingestion/`,
`shiplog/evidence/p6-generation/`.

### 5.6 Part B, executed late (2026-09-01)

Part B was executed for real today against the committed source
(deliverables/PART-B-SOURCE.md): 29 ranked findings, 5 of them S0 — after
sitting "blocked on source material" for the whole build. It was late because
the campaigns PR had been in the founding brief since day zero and nobody
inside the repo tested the claim that we didn't have it; an external review
round caught it (catch #25, featured as Catch 5 in §2). The system change is
the intake rule now in CLAUDE.md: inbound documents are split on arrival into
instructions and source material, and the source is committed on day zero.
