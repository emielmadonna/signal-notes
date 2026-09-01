## Catch #1 — 2026-09-01 02:09 (dry run, README task)
- CLAIM: Builder's stream line follows the constitution's format.
- VICTIM: Emiel, who reads docs/stream.md live as a running narration; and every
  future builder, who learns from this dry run whether the format is enforced.
- THE CATCH: Auditor re-read the line. Constitution mandates present tense; the
  02:05:09 line reads "Wrote the README..." — past tense. Evidence: the line
  itself in docs/stream.md.
- FIX + SYSTEM CHANGE: Builder rewrites the line in present tense; a tense check
  on new stream lines goes onto the gatecheck backlog.

## Catch #2 — 2026-09-01 02:09 (dry run, README task)
- CLAIM: README contains exactly the three required elements and nothing else.
- VICTIM: Any reader of the repo front page, who takes "verified evidence trail"
  as a status assertion; the constitution's own rule "never claim a result you
  did not observe."
- THE CATCH: Auditor byte-checked README.md: the builder added the word
  "verified" — an unproven claim baked into a permanent file while DB checks are
  still skipped. Evidence: xxd/cat output in the auditor's review.
- FIX + SYSTEM CHANGE: Drop "verified"; AGENT-PROMPTS builder prompt gains a
  line: reproduce spec wording, never embellish with adjectives that assert
  unobserved results.

## Catch #3 — 2026-09-01 02:09 (dispatcher self-catch, flagged by auditor)
- CLAIM: Nothing merges before its Change Card is approved.
- VICTIM: The audit trail itself — if pending builder edits ride along inside
  unrelated commits, "no merge before approval" quietly stops being true.
- THE CATCH: Auditor traced git history: dispatcher commit bb4081d (plan
  amendment) swept up builder-0's uncommitted stream line. Evidence:
  git show bb4081d -- docs/stream.md.
- FIX + SYSTEM CHANGE: Dispatcher commits now use targeted file adds only, and
  never include files carrying unapproved builder work. Logged against myself.

### Addendum to Catch #2 — 2026-09-01 02:11 (dispatcher correction)
The builder flagged on resubmission that the word "verified" was present in the
DISPATCHER'S task spec; the builder reproduced spec wording faithfully. Blame
reassigned: the unobserved claim originated with me (dispatcher). The fix and
system change stand — and the builder-prompt rule now cuts both ways: I write
specs without asserting unobserved results, builders don't add them.

## Catch #4 — 2026-09-01 02:23 (P1, before any database write)
- CLAIM: (implicit) the Supabase connection available to the agents is the
  Signal Notes project, ready for migration 0001.
- VICTIM: A live production database for a different product. Its migration
  history shows ~300 applied migrations (campaigns, contacts, billing, wallets)
  and it ALREADY contains an "organizations" table — applying our migration
  0001 there would have collided with production schema, partially applied,
  and put Signal Notes RLS policies onto another product's tables.
- THE CATCH: Dispatcher ran list_migrations + list_tables read-only checks
  BEFORE any write, per "prove, don't assume". Evidence: the pasted migration
  list (300 foreign versions) and project URL ootyfqiujstibjtspdrp.supabase.co
  in the session log; evidence/r4-wrong-project-migrations.txt.
- FIX + SYSTEM CHANGE: Zero writes were sent to that project. Signal Notes gets
  its own freshly created blank project; the project ref will be pinned in the
  repo (checked by the verifier before any DB operation) so no agent can ever
  aim a migration at the wrong database again.

## Catch #5 — 2026-09-01 02:38 (P1, migration 0001, REJECTED before apply)
- CLAIM: "every policy org-scoped via the helper; RLS proven."
- VICTIM: any organization's briefings and documents. A member of org A could
  attach org B's document to an org-A briefing (grounding then references
  documents the org cannot legally read), and could hang forged child rows
  (sources/feedback/log lines) off org B's briefings.
- THE CATCH: Auditor read all 18 policies against rule 1 and found the three
  child-table INSERT policies check only the row's own org_id — neither
  briefing_id nor document_id is validated to belong to that same org, and
  foreign keys bypass RLS. Evidence: migration lines 198-202, 219-226, 248-252.
- FIX + SYSTEM CHANGE: composite foreign keys — unique (id, org_id) on parents,
  child FKs reference (id, org_id) pairs — so the database itself forces
  parent/child org agreement. Probe extended to attack exactly this (catch #6).

## Catch #6 — 2026-09-01 02:38 (P1, two-org probe, REJECTED)
- CLAIM: probe prints "all 8 checks passed. Each organization is invisible and
  untouchable to the other."
- VICTIM: Emiel, who merges on that sentence.
- THE CATCH: Auditor read the probe: all 8 checks touch ONLY the documents
  table. The four briefing tables — where catch #5's holes live — are never
  probed. A probe that tried a cross-org briefing_sources insert would have
  caught #5 on its own.
- FIX + SYSTEM CHANGE: probe extended to cross-org attacks on briefings and
  briefing_sources; its final claim reworded to state exactly what it proved.

## Catch #7 — 2026-09-01 02:38 (P1, seed script, REJECTED)
- CLAIM: seed prints "Set SEED_USER_PASSWORD in .env.local and re-run if the
  probe script needs to sign in."
- VICTIM: the R1 proof itself. If seed ever runs without the env var, users get
  a discarded random password, and re-running does nothing (existing users are
  returned without a password update) — the probe is locked out forever.
- THE CATCH: Auditor traced the re-run path (getOrCreateUser returns existing
  users untouched) and confirmed SEED_USER_PASSWORD was absent from .env.local
  and .env.example, making the failure path the default path.
- FIX + SYSTEM CHANGE: seed updates existing users' passwords when the env var
  is set; SEED_USER_PASSWORD added to .env.example so it cannot be forgotten.

## Catch #8 — 2026-09-01 02:48 (P1, sign-in redirect, REJECTED)
- CLAIM: the ?next= guard ("must start with / and not //") blocks open redirects.
- VICTIM: any user who signs in through a crafted link — their fresh session
  lands on an attacker's page dressed as Signal Notes.
- THE CATCH: Auditor constructed the bypass: browsers treat backslash as slash
  in web addresses, so "/\evil.com" passes both guard conditions yet navigates
  to evil.com; tab/newline tricks do the same. Evidence: signin-form.ts lines
  11-18 + the two working bypass strings in the audit.
- FIX + SYSTEM CHANGE: the guard now resolves the destination against our own
  origin and requires it to stay there; the two bypass strings become
  permanent gatecheck test cases.

## Catch #9 — 2026-09-01 02:48 (P1, sign-out button, REJECTED)
- CLAIM: card-3 surfaces built to rules 3 and 10.
- VICTIM: anyone signing out on a slow connection — an inert button inviting
  double submits; rule 10 allows no exceptions.
- THE CATCH: Auditor compared the two buttons: sign-in shows "Signing in…",
  sign-out has no busy state at all. Evidence: documents/page.tsx lines 53-57.
- FIX + SYSTEM CHANGE: a reusable pending-aware submit button component that
  every later server-action form uses, so the gap cannot recur form by form.

## Catch #10 — 2026-09-01 02:58 (first CI run on GitHub)
- CLAIM: "typecheck passes" (true on this machine, pasted in three audits).
- VICTIM: any merge relying on a green local run — CI would block every push,
  or worse, typecheck could silently diverge between machines.
- THE CATCH: the very first CI run failed: a clean checkout has none of the
  framework's generated route types, which only exist locally as leftovers of
  a build. Evidence: GitHub Actions run 33494862048, "FAIL typecheck".
- FIX + SYSTEM CHANGE: the verifier now generates those types itself before
  type-checking, so local and CI runs check the same thing. The fix is proven
  by the next CI run on this same branch.

## Catch #11 — 2026-09-01 03:16 (CI live-check runs, via the new evidence artifact)
- CLAIM: the two-org probe "runs inside the verifier and CI" (SHIPLOG R1 entry).
- VICTIM: the CI isolation gate — it can never pass on GitHub, so either every
  push stays red or someone eventually mutes the one check that guards against
  cross-tenant leaks.
- THE CATCH: the probe failed opaquely in CI twice; the newly added evidence
  artifact surfaced the real reason: the scripts' env loader hard-requires a
  .env.local file and dies on a clean checkout — even with every needed
  variable already present in the environment. Evidence:
  r1-probe-20260901-101617.txt ("No .env.local found ... Run this from the
  repo root."), GitHub runs 33495059559 / 33496288128.
- FIX + SYSTEM CHANGE: loader treats .env.local as an optional fallback and
  fatals only when a required variable is missing from BOTH sources; CI now
  uploads evidence artifacts on failure so no gate can fail unreadably again.
  (GitHub secrets were also re-set newline-free as hygiene while diagnosing.)

## Catch #12 — 2026-09-01 03:55 (dispatcher self-catch, spec edit)
- CLAIM: "spec updated" — the switch-account row removed from DESIGN-SPEC.
- VICTIM: Builder-5, who would have read the untouched layout line and built
  the inert row Emiel had just cut.
- THE CATCH: the edit script printed success without verifying; a grep after
  the commit showed the layout line unchanged (the search string missed a line
  wrap). Evidence: grep output in session, fix commit on p2-design.
- FIX + SYSTEM CHANGE: line fixed and re-verified to zero matches. Rule for
  myself: every scripted text edit ends with a grep that proves the change,
  BEFORE the commit, not after.

## Catch #13 — 2026-09-01 03:57 (P2, tokens/primitives, REJECTED)
- CLAIM: builder-4's comment: the variable font load "covers the canvas
  request".
- VICTIM: every serif surface in the app — briefing titles, card titles, the
  wordmark — rendering in the text-optical cut instead of the display cut the
  approved design uses. A whole-app "almost right" nobody could name later.
- THE CATCH: the auditor inspected the actual shipped font file with font
  tooling: its axis table contains only the weight axis; the optical-size axis
  the canvas requests (7-72) was silently dropped by the font loader. Evidence:
  fvar table dump in the audit, canvas line 11 vs layout.tsx lines 11-16.
- FIX + SYSTEM CHANGE: declare the optical-size axis in the font config (one
  line); the P2 visual parity pass now includes a headline close-up comparison
  so optical-size regressions are visible in evidence.
