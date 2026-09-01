CHANGE CARD #000 (practice — P0.5 dry run)
STATUS: APPROVED by Emiel, 2026-09-01 (verbal in session; merged by dispatcher)

WHAT CHANGED: The project now has a front page (README) with the product name,
its one-line promise, and a pointer to the rulebook and the diary. The real
point of this card: it proves the whole review loop works — builder built,
auditor rejected with real reasons, builder fixed, auditor passed, and the card
reached you before any merge.

FILES: README.md (new), docs/stream.md (diary lines appended)

CONSTITUTION RULES TOUCHED: none of the ten product rules; this exercises the
protocol itself (proof-of-done, stream, catch log, no-merge-before-approval).

THE DECISION: Keep the README to exactly three elements, nothing more.
REJECTED: badges, setup instructions, project description — the front page
should not make claims the harness hasn't proven yet.

PROOF OF DONE:
  - [PASS] README content: auditor byte-checked (xxd) — exactly the three
    required elements, final line reads "...see SHIPLOG.md for the evidence
    trail." with "verified" removed.
  - [PASS] Diary integrity: git diff shows stream.md is append-only; the
    original past-tense line preserved, correction appended in present tense
    at 02:10:30.
  - [PASS] Scope: builder-attributable changes are exactly README.md + appended
    stream lines; no commit made by any agent on this work.
  - [PASS] bash scripts/constitution.sh exits 0 (all static checks green; DB
    checks WARN/skipped, expected pre-foundation). Evidence:
    shiplog/evidence/constitution-20260901-021119.txt
  - [UNPROVEN → n/a] npm run constitution / gatecheck.ts execution: no Node
    project exists yet (arrives with the P1 scaffold); the shell verifier was
    run directly instead.

AUDITOR: PASS (2nd attempt, 02:11:40)
  1st attempt: REJECT — (a) builder diary line in past tense, constitution
  requires present; (b) README embellished "evidence trail" into "verified
  evidence trail", asserting a result nobody observed. Catch log #1 and #2.
  The auditor also flagged the dispatcher for sweeping a pending builder edit
  into an unrelated commit — catch log #3, logged against the dispatcher.

WHAT BREAKS IF THIS IS WRONG: If the loop can't catch a two-word embellishment
on a three-line file, it can't be trusted to catch a missing RLS policy. The
dry run is the calibration shot.
