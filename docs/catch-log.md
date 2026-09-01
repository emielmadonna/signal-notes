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
  the downloaded CI evidence artifact showed "No .env.local found ... Run this
  from the repo root." (a transient CI-runner file, not a committed artifact);
  GitHub runs 33495059559 / 33496288128.
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

## Catch #14 — 2026-09-01 04:17 (migration 0002, REJECTED before apply)
- CLAIM: audit_events is the append-only accountability trail.
- VICTIM: the trail's own trustworthiness — any org member could insert lines
  under a colleague's name or as "SYSTEM", fabricating completions and checks.
  A forgeable audit trail is worse than none: it lends forged lines authority.
- THE CATCH: the auditor noticed actor was free text with only org-membership
  checked on insert — while every other writable table in the same two
  migrations pins identity to the signed-in user. The inconsistency was the
  tell. Evidence: migration lines 119 + 150-154 vs briefing_notes_insert.
- FIX + SYSTEM CHANGE: actor_user_id column pinned to the signed-in user on
  every authenticated insert; SYSTEM lines only writable server-side; display
  name derived server-side, never client-supplied.

## Catch #15 — 2026-09-01 04:17 (migration 0002, same review)
- CLAIM: "once an audit line is written nobody can edit it or make it
  disappear from the app" (the migration's own comment).
- VICTIM: the deleted-briefing case — exactly when an audit trail matters
  most. Cascade deletion would have silently purged a briefing's entire
  history the moment the briefing was deleted.
- THE CATCH: the auditor read the cascade rules against the comment's promise
  and found them in direct contradiction. Evidence: migration lines 128/132
  vs 147-149.
- FIX + SYSTEM CHANGE: audit rows now survive their subjects — deleting a
  briefing or document blanks the link but keeps the line, org-scoped. The
  comment now tells the truth.

## Catch #16 — 2026-09-01 05:10 (P3, fetch-url route, security)
- CLAIM: the web-URL ingestion route safely fetches a user-supplied address.
- VICTIM: the server itself — an authenticated user could aim it at
  http://169.254.169.254 (cloud metadata) or internal 127.0.0.1/RFC-1918 hosts
  and read the response back through the stored document (a read-SSRF oracle);
  redirect:"follow" could also bounce a public URL into a private one.
- THE CATCH: the auditor read the fetch path and flagged the missing private-
  address guard, judging severity honestly (low-moderate on Vercel serverless,
  higher if self-hosted) and recommending the fix rather than only noting it.
- FIX + SYSTEM CHANGE: an isBlockedHost guard rejects localhost / metadata IP /
  RFC-1918 / link-local / unique-local / loopback before fetch; redirects are
  now manual and every hop's host is re-validated (max 4 hops). Verified across
  16 host cases. DNS-rebinding residual is on the ASSUMED list.

## Catch #17 — 2026-09-01 05:10 (P3 integration, REJECTED)
- CLAIM: the documents empty state is done.
- VICTIM: any user with an empty (or freshly emptied) workspace — the "Add
  document" button sat greyed out with a tooltip "arrives in P3", pointing at a
  feature that shipped in this very phase. A lying empty state.
- THE CATCH: the auditor cross-checked the disabled CTA against the routes that
  shipped this phase and found the button dead while /documents/new was live.
  Evidence: section-state.tsx line 134.
- FIX + SYSTEM CHANGE: onAdd threaded into SectionState, the button enabled to
  open the add sheet, both stale "arrives in P3" tooltips corrected. Rule for
  the phase: when a feature lands, sweep its own empty/disabled states in the
  same phase — a shipped feature behind a dead button is not done.

## Catch #18 — 2026-09-01 05:38 (P4 engine, REJECTED)
- CLAIM: lib/prompts/briefing.ts header: "Every word the model reads lives
  here and NOWHERE ELSE." Verifier R5: PASS.
- VICTIM: the operations-review surface rule 5 protects — three model-facing
  instruction strings ("Now call submit_briefing…", the out-of-set refusal, the
  "resubmit with a non-empty title…" correction) were written inline in
  lib/ai/anthropic.ts, unversioned, invisible to review. The compliance claim
  in the prompt file's own header was false.
- THE CATCH: the auditor read the engine line by line and found the strings the
  R5 grep heuristic ('you are a|system prompt|<instructions') structurally
  cannot see. Evidence: anthropic.ts lines 261-265, 289, 325.
- FIX + SYSTEM CHANGE: the three strings move to named, versioned constants in
  lib/prompts/briefing.ts. The verifier gains an R5b WARN flagging
  second-person/imperative model-directive strings in lib/ai and app/api so
  this class can't hide behind a green R5 again.

## Catch #19 — 2026-09-01 05:50 (P4 engine, builder self-catch during re-test)
- CLAIM: (implicit) the generation loop is robust across runs.
- VICTIM: ~1 in 6 real generations — the model service returned a 400 ("text
  content blocks must be non-empty") when the engine echoed an occasional
  empty streamed text block back into the tool-continuation turn. The failure
  path handled it correctly (status failed, partial kept), but a flaky 1-in-6
  failure on the product's core action is not acceptable.
- THE CATCH: builder-10, re-testing after the rule-5 move, hit the 400,
  refused to wave it off as transient, and reproduced it deterministically
  with a diagnostic harness until it found the empty-block echo. Evidence: 7
  consecutive clean runs after the one-line guard.
- FIX + SYSTEM CHANGE: empty text blocks are dropped before the assistant turn
  is echoed back into the tool loop (thinking + tool_use order preserved).
  Bug pre-dated the rule-5 change (that move was byte-identical).

## Catch #20 — 2026-09-01 06:xx (Mock-Wren round 1, rehearsal)
- CLAIM: the submission's evidence pointers all resolve; the decision cards and
  SHIPLOG state exactly what the gates do.
- VICTIM: Emiel in the live walkthrough — the flagship catch #4 ("wrong
  production DB") cited shiplog/evidence/r4-wrong-project-migrations.txt, which
  was never saved; Wren's first move is "show me the file," and it would 404 on
  the proudest story. Plus D05 oversold a WARN as an auto-block, and SHIPLOG §1
  left R2/R3 as unchecked boxes with placeholder filenames.
- THE CATCH: the Mock-Wren rehearsal agent, playing both sides against the real
  repo, tried to open every cited file and argued the other side of each
  decision. Full transcript: deliverables/MOCK-WREN-ROUND-1.md.
- FIX + SYSTEM CHANGE: created the missing evidence from genuinely-observed data
  (no false precision — count stated as "~300", head quoted verbatim, the
  saved tables file named as the load-bearing artifact); canonical committed
  probe proof (r1-probe-final-24checks.txt) replacing gitignored timestamped
  refs; R2/R3 boxes filled with the real verifier evidence; D05 scoped to
  "WARN, surfaced-not-auto-blocked"; SHIPLOG §3 concedes optimistic-with-
  rollback is the correct reading. Standing rule: a dead-pointer sweep
  (grep evidence filenames, test -f each) runs before any submission is called
  done — no claim may cite a file that doesn't exist.

## Catch #21 — 2026-09-01 (Mock-Wren round 2, verification of round-1 fixes)
- CLAIM (mine, dispatcher, in the stream at 11:18): "Zero dead pointers now."
- VICTIM: the submission's credibility — a freshly-made "zero dead pointers"
  promise that was itself false, because my dead-pointer sweep regex only
  matched full "shiplog/evidence/..." paths and missed a BARE-filename
  citation in decision card D07 (r1-probe-20260901-042430.txt), and I never
  re-ran the sweep over the decision cards after claiming it.
- THE CATCH: Mock-Wren round 2 re-ran the dead-pointer attack it had promised,
  test -f'd every cited file across the D-cards, and found D07 still 404'd —
  the exact class round 1 flagged, now contradicting my own promise. It also
  surfaced that the gitignore made ALL timestamped probe/constitution files
  untracked, so several "025459" citations were dead for a fresh clone, and
  that the citation check proves presence not support (an un-listed ASSUMED
  gap). Transcript: deliverables/MOCK-WREN-ROUND-2.md.
- FIX + SYSTEM CHANGE: every evidence citation across SHIPLOG + all cards +
  all decisions + Part B/C repointed to a COMMITTED file and verified with a
  git-ls-files check (not just test -f) — "✓ every evidence file cited in the
  index docs is committed". The sweep now checks git-tracking, catches bare
  filenames, and is documented as a pre-submission gate. The citation
  presence-vs-support limit is now on the ASSUMED list. Lesson: a verification
  claim ("zero X") must itself be verified by the tool, not asserted — the
  same standard the whole build runs on, applied to my own promise.

## Catch #22 — 2026-09-01 (full E2E re-run after the account swap)
- CLAIM: the E2E suite proves the whole app; "everything works."
- VICTIM: any future run — 4 tests hard-coded one specific demo briefing id
  (345eef7d…). That briefing was deleted during the heavy multi-run test churn
  (a real DELETE — its cascade children went, audit rows survived nulled;
  product FK behavior all correct, and user-deletion was NOT the cause since
  briefings.created_by is on-delete-set-null and 6 sibling briefings survived).
  With the id gone, the 4 tests failed — a pinned fixture, not a product bug.
- THE CATCH: re-running the FULL suite after the admin-account swap (rather than
  trusting the earlier green) surfaced the 4 failures.
- FIX + SYSTEM CHANGE: added helpers.firstCompleteBriefingId() — every reading-
  view / generation / responsive / theme / isolation / verify test now resolves
  a LIVE complete briefing by clicking a COMPLETE card, so no vanished id can
  break them or make an isolation check pass vacuously. Lesson: tests must not
  pin to a single mutable row; resolve fixtures from live state.

## Catch #23 — 2026-09-01 (Emiel: "document uploading doesn't work, 500 errors")
- CLAIM (mine, catch #22, in the stream at 12:30): "Document upload and
  generation both verified live." The multi-format upload suite was green, so
  upload was called done.
- VICTIM: Emiel, who could not add his own documents. Every upload whose
  extracted text happened to contain a NUL byte or an unpaired surrogate died
  as `500 Saving the document failed` — and those are not exotic: pdf.js emits
  a NUL for any glyph with no Unicode mapping (ordinary CID-font PDFs), and
  RTF's \uN escape plus pdf.js's UTF-16 handling both emit lone surrogates.
- THE CATCH: posting real files at the live route rather than only the four
  hand-made fixtures. The fixtures were clean ASCII, so the suite was green on
  a route that broke on real documents. Two reproductions, verbatim:
      RESULT 500 | nul-byte.txt       | {"error":"Saving the document failed:
                                        unsupported Unicode escape sequence..."}
      RESULT 500 | lone-surrogate.rtf | {"error":"Saving the document failed:
                                        Empty or invalid json..."}
  Postgres `text` physically cannot hold U+0000; a lone surrogate breaks the
  JSON encoding before PostgREST ever sees the row.
- FIX + SYSTEM CHANGE: lib/ingest/sanitize.ts strips NULs, lone surrogates and
  stray control characters before any write, and is applied on ALL THREE paths
  into documents.body — the upload route, the fetch-url route, and the paste
  path in the add-document sheet — so no future ingestion path can forget it.
  tests/sanitize.test.ts pins both reproductions plus the JSON round-trip;
  e2e/p6-ingestion.spec.ts posts both files at the live route. Lesson: a green
  suite proves the fixtures, not the feature — ingestion tests must include
  bytes the parsers actually produce, not only bytes we typed ourselves.

## Catch #24 — 2026-09-01 (same report: "accept all the file types we can support")
- CLAIM (implicit, in the route's own 415 message): "We can read PDF, DOCX,
  TXT, MD and RTF files" — presented as the limit of what is possible.
- VICTIM: anyone with a normal workspace. A .csv export, a saved .html page, a
  .vtt or .srt call transcript, a .json export, a .yaml config, a .log — every
  one of them is plain text we could always have read, and every one was
  refused. So was any file with NO extension, which is what email attachments
  and many downloads actually look like on disk.
- THE CATCH: probing the live route with real files off the machine rather than
  the fixture directory: three of seven were refused 415 purely on their names,
  not on our ability to read them.
- FIX + SYSTEM CHANGE: what the uploader accepts is now a TABLE
  (lib/ingest/file-types.ts) rather than a hard-coded if-chain — fifteen labels
  across four parse strategies, plus content sniffing (%PDF / PK / {\rtf /
  is-it-text) for a file whose name says nothing, plus named refusals that say
  what to do instead ("save it as .docx", "export the sheet as CSV") rather
  than a generic no. Migration 0004 widens documents_ext_check to exactly the
  labels the table can emit, and tests/file-types.test.ts asserts those two
  lists against each other — a mismatch is a unit-test failure now, not a 500
  in production. Lesson: an error message that states a limit should state a
  REAL limit; "we can't read that" and "we didn't bother" must not look alike.
