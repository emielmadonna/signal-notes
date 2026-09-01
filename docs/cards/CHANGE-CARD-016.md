CHANGE CARD #016
STATUS: PENDING — awaiting Emiel. Committed locally, NOT pushed to origin.

WHAT CHANGED: Part B was never blocked. The campaigns PR it reviews was quoted
in full in the Milestone 0 brief email and had been in our possession since day
zero — our intake read the brief for instructions and never filed the material
it handed us. An outside review (a mock-Wren round Emiel ran from his Cowork
session, reading the ORIGINAL BRIEF against the deliverables folder rather than
reading the deliverables against each other) found it. This card is the catch,
the rule that came out of it, and Part B actually executed.

  The catch (logged first, before PART-B.md was touched):
  - docs/catch-log.md, catch #25, four parts. The CLAIM was PART-B.md's own
    banner: "BLOCKED ON SOURCE MATERIAL — that PR is not in this workspace,"
    with the refusal argued as integrity. The VICTIM is a graded deliverable
    that sat unexecutable for the whole build; had it shipped it would have
    scored as missing work dressed up as principle, and the framing would have
    read as a dodge — Mock-Wren round 1 had already put it on the board (§E,
    "honest boundary or dodge?") and graded it "strong stand, but contingent".
    Contingent on a fact nobody checked.
  - Why nothing inside this repo caught it across two mock-Wren rounds and 24
    prior catches: every review took "the PR is not in the workspace" as a
    premise instead of a claim to test. We had a rule against claiming what we
    had not observed, and no rule against failing to observe what we already
    held.

  The system change (one line, in CLAUDE.md under Operating protocol):
  - INTAKE: every inbound document is split on arrival into INSTRUCTIONS (what
    we are asked to do) and SOURCE MATERIAL (what we are given). Source material
    is committed to the repo and referenced from the deliverable that needs it
    on day zero. "We don't have it" is a claim, and it needs checking like any
    other.

  The source, committed:
  - deliverables/PART-B-SOURCE.md — the PR verbatim (migration, API route,
    client component), byte-identical to the file Emiel supplied
    (sha256 1cc9eee32a842082c7eba67978d78cbfbee97c13f918fc7adbdf2fc2875605db),
    committed in its own commit ahead of the review so every quote in Part B can
    be diffed against the original.

  Part B, executed:
  - deliverables/PART-B.md rewritten. The BLOCKED banner and the excuse
    paragraph are gone. The severity legend and the SHOW-ME template stay.
  - 29 findings against the three files: 5 x S0, 11 x S1, 13 x S2, ranked most
    severe first, each with a one-sentence concrete failure, a one-line fix, a
    verbatim quote, a numbered plain-English walkthrough a non-coder can retell,
    and a HOW YOU'D VERIFY.
  - The S0s: the service-role key in the browser bundle; `using (true)` on the
    read policy (every org reads every org); `insert({ ...body, user_id })` mass
    assignment (the caller picks their own organization_id, ai_output, id and
    status); a write policy that never mentions the organization; and a
    migration whose final `drop column legacy_notes` targets a column the same
    file never creates, so the whole file rolls back and no database ever gets
    the tables.
  - Also caught below the famous one: campaign_events has RLS enabled and zero
    policies, so its only insert cannot succeed — and that insert's error is
    never captured, so the event trail is permanently empty and silent about it;
    `Promise.allSettled` + `ok.length > 0` printing "All sent" when every send
    returned 500; a discarded `{ error }` turning a failed read into 200
    `{"campaigns":[]}`; a client that never checks `res.ok`; an empty state that
    shows on every load before data arrives; and the route importing
    `createServerClient` from our own module, which exports no such name.
  - A "What I could not determine from this diff" section lists three open
    questions (R5 prompt location in lib/ai, the missing /send route, schema
    naming) so silence is not mistaken for a clean bill of health.
  - Top 3 argued from a stated principle — silent beats loud, irreversible beats
    repairable, cross-tenant beats single-tenant — including the argument for
    why the un-runnable migration is deliberately NOT in the top 3.

  One stale claim elsewhere, fixed:
  - deliverables/DEMO-CHECKLIST.md's disclosure list still said "Part B is not
    done". Executing Part B without touching that line would have left a
    deliverable asserting something false. It now discloses the real thing: Part
    B was late, the PR was ours all along, and an outside review caught it.

FILES: deliverables/PART-B-SOURCE.md (new, committed separately);
deliverables/PART-B.md (rewritten); docs/catch-log.md (catch #25); CLAUDE.md
(intake rule); deliverables/DEMO-CHECKLIST.md (stale disclosure); docs/stream.md;
docs/cards/CHANGE-CARD-016.md. No product code changed.

CONSTITUTION RULES: the intake rule is new, under Operating protocol. The review
itself is scored against all ten. Nothing in the product was modified, so R1-R10
are unaffected here and were re-verified green anyway.

THE DECISION: the catch was written BEFORE PART-B.md was touched, and the source
was committed in its own commit before either. That ordering is deliberate. The
alternative — quietly filling in Part B now that the material turned up, and
letting the git history imply it was always on schedule — would have produced a
better-looking repo and a worse one. This build's whole claim is that mistakes
get logged at the moment they happen; a miss found by an outsider is the exact
case where that claim is worth something or worth nothing. Rejected alternatives:
(a) rewriting Mock-Wren round 1's §E, which graded the blocked Part B favourably
— rejected, those files are a record of a past rehearsal and editing them would
be reconstructing history; the round-1 verdict stands as written and is now
visibly contingent on a wrong premise, which is the useful thing about it.
(b) Softening the catch to "source material located" — rejected, nobody located
anything; we were handed it and did not file it.

PROOF OF DONE:
  - [PASS] npm run constitution — every check green:
      PASS   R2 no select("*") or empty select()
      PASS   R3 no empty catch {}
      PASS   R3b/R3c/R5b conventions (recorded exceptions verified)
      PASS   KEY no SERVICE_ROLE in app code
      PASS   KEY no hardcoded Anthropic key (sk-ant-) anywhere
      PASS   KEY ANTHROPIC_API_KEY only reachable from server code
      PASS   PIN linked project matches pinned ref rqvyiclwhihhsxymenrp
      PASS   R1a RLS enabled + policy present on every public table
      PASS   R4 migrations 20260901000001-000004 applied (tracking rows present)
      PASS   R1b two-org probe
      PASS   typecheck / lint / unit tests
      SKIP   e2e suite NOT RUN (needs RUN_E2E=1 + live DB)
      PASS   CONSTITUTION: all checks green.
  - [PASS] npx tsc --noEmit — exit code 0.
  - [PASS] npm test — 53/53 unit tests, 0 fail.
  - [PASS] Quote integrity, the check that matters for this card. A script read
    every fenced line in PART-B.md and asserted it appears verbatim in
    PART-B-SOURCE.md: 66 fenced lines, 53 of them PR quotes, all 53 found. The
    13 that did not match are accounted for individually — the 7-line SHOW-ME
    template, 3 `...` elision markers, and the 3-line tsc output block, which is
    my own evidence rather than a quote from the PR.
  - [PASS] deliverables/PART-B-SOURCE.md is byte-identical to the file supplied
    (`diff -q` clean; sha256 recorded above and in the catch entry).
  - [PASS] The S1-1 finding is not an assertion. A three-line probe importing
    `createServerClient` from our own module was typechecked in this repo and
    deleted immediately (never committed); the pasted error is real:
      error TS2724: '"@/lib/supabase/server"' has no exported member named
      'createServerClient'. Did you mean 'createClient'?
    Corroborated independently by `grep -n "^export" lib/supabase/server.ts` →
    `export async function createClient() {`.
  - [UNPROVEN, and stated in the finding itself] S0-5, that the migration aborts.
    I did not execute it. This machine has no psql and no docker (`which psql`,
    `which docker` both empty) and the only reachable database is the live one,
    which is not a place to test destructive DDL. The finding rests on reading
    the file — the created table's column list has no `legacy_notes` — and says
    so in its own HOW YOU'D VERIFY rather than in a footnote.
  - [NOT APPLICABLE] npm run gatecheck. It takes a card spec and runs the
    Playwright specs a card names; this card changes no product surface, so
    there is nothing for it to assemble. Running it with no argument prints its
    usage line. Named here rather than omitted.
  - [NOTE, not a proof] The verifier's KEY checks pass on this branch, and that
    fact says NOTHING about the campaigns PR. `scripts/constitution.sh` scans
    `SRC_DIRS="app components lib"`; PART-B.md is a markdown deliverable and
    contains the string SERVICE_ROLE three times without tripping it. If the
    PR's files were actually placed in `components/`, the KEY block would fail
    the build — which is finding S0-1's own HOW YOU'D VERIFY. Do not read
    "constitution green" as "the PR is clean".
AUDITOR: not yet reviewed.
WHAT BREAKS IF THIS IS WRONG: two things, in different directions. If the
findings are wrong, Emiel defends 29 claims live against a reviewer holding the
same PR — which is why every one carries the quoted line rather than a summary,
and why the three things I could not determine are listed as open questions
instead of being guessed at. If the catch is wrong — if this was somehow not a
miss — then we have logged a failure that did not happen, which is cheap. The
asymmetry is the point: the expensive error was shipping Part B blocked, and
that error is now impossible to repeat quietly, because the intake rule makes
"we don't have it" a claim somebody has to check.
