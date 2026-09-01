CHANGE CARD #015
STATUS: PENDING — awaiting Emiel. Migration 0003 is APPLIED (verified live).

WHAT CHANGED: the remediation pass from an adversarial audit of the whole
repository. Seventeen findings, in three groups.

  Security / correctness (code):
  - SSRF: the host guard moved to lib/net/private-address.ts and grew real
    IPv6 handling. An IPv4-mapped literal — http://[::ffff:127.0.0.1]/, which
    the URL parser normalises to [::ffff:7f00:1] — used to walk straight
    through to loopback, and the ::ffff: form of 169.254.169.254 reached cloud
    instance metadata. The same function's unique-local test ran on every
    hostname string rather than only IPv6 literals, so it rejected fcc.gov,
    fda.gov, fdny.org and every other real domain beginning "fc"/"fd".
  - HTML extraction moved to lib/html/readable-text.ts. decodeEntities called
    String.fromCodePoint(parseInt(...)) unguarded, so a page containing
    "&#xFFFFFFFF;" threw RangeError outside every try/catch and Next answered
    with an empty-bodied 500 — the exact failure R3 forbids.
  - audit_events.actor is now stamped from the verified JWT by a trigger
    (migration 0003). The column's own comment claimed it was "derived
    server-side… never from client input", but the RLS policy only ever
    constrained actor_user_id: audit rows are inserted from browser code, so
    any signed-in user could sign a line 'SYSTEM' — the one string the reading
    view special-cases.
  - Rate limiting, which did not exist. /api/documents/fetch-url is an
    authenticated outbound fetcher and /api/briefings/generate spends up to 16
    model turns per call. Fixed-window counters now live in Postgres (the app
    is serverless, so an in-memory limiter would reset every cold start), with
    the ceilings hardcoded in the SQL function so a caller cannot ask for a
    bigger allowance.
  - A briefing is capped at 12 source documents, and each read_document result
    at 240k characters — with the model TOLD when it is reading a prefix. A
    single legitimate 20 MB .txt upload is ~5M tokens and used to turn every
    generation into an opaque "the model service returned an error".
  - Postgres error text no longer reaches the browser. lib/errors.ts logs the
    driver's words against a short reference and returns a true sentence plus
    that reference.
  - One deterministic org lookup (lib/org.ts) replaced four copy-pasted
    `.limit(1)` queries with no ORDER BY — for a user in two organizations,
    which org a document landed in was arbitrary and could differ per request.
  - updated_at now updates (triggers in 0003). It defaulted to now() and was
    never written again, so it was permanently equal to created_at.
  - The activity log is batched: one multi-row insert per ~24 lines or 120ms
    instead of one awaited INSERT per ~180-character chunk. A 6000-word
    briefing was spending 10-15s of pure database latency inside the
    user-visible stream. Persist-then-forward is unchanged.

  The gate (process):
  - The verifier ran NO TESTS. Its block was guarded by `grep -q '"test"'
    package.json`, and there was no "test" script, so it skipped in silence
    and reported all-green. There is now a unit suite (tests/, 27 tests), a
    "test" script, and a missing test script is itself a FAIL.
  - Lint was in no pipeline and was failing (5 errors). It is now in the
    verifier and in CI, and it passes.
  - The Playwright suite — 48 tests, 10 files — was invoked by nothing. It is
    now `npm run test:e2e`, runs in the verifier under RUN_E2E=1, and has its
    own CI job. When it does not run, the verifier SAYS SO instead of skipping
    quietly.
  - R3b/R3c/R5b were WARN-only, each ending "auditor must confirm each one".
    Nobody confirms anything in CI. They are now scripts/check-conventions.ts,
    which FAILS on any hit not recorded in docs/constitution-exceptions.json
    with a written reason — and also fails on a recorded exception that no
    longer matches anything, so the list cannot rot into a blanket amnesty.
    R3b was additionally rewritten: it tested for "error" on the SAME LINE as
    a write call, which flagged 21 correctly-checked writes and found none of
    the real ones. It now reads the whole statement, and finds 2.
  - gatecheck.ts had never been given an input (it reads .spec.json; all 14
    cards are .md) and its screenshot handler was a permanent `TODO(P2)` stub
    returning UNPROVEN unconditionally. It now runs the Playwright specs a
    card names, plus the conventions checker — and this card ships the first
    .spec.json, alongside a template.

FILES: lib/net/private-address.ts, lib/html/readable-text.ts, lib/org.ts,
lib/errors.ts, lib/rate-limit.ts (new); tests/*.test.ts (new);
scripts/check-conventions.ts (new); docs/constitution-exceptions.json (new);
supabase/migrations/20260901000003_hardening.sql (new, UNAPPLIED);
app/api/documents/{upload,fetch-url}/route.ts, app/api/briefings/generate/route.ts,
app/api/briefings/[id]/events/route.ts, lib/ai/{generation,anthropic}.ts,
lib/prompts/briefing.ts, lib/workspace-data.ts, components/theme-provider.tsx,
components/workspace/briefing-card.tsx, components/add-document/add-document-sheet.tsx,
scripts/constitution.sh, scripts/gatecheck.ts, package.json, eslint.config.mjs,
.github/workflows/ci.yml, MASTER-PLAN.md.

CONSTITUTION RULES: R2 and R5 unaffected and re-verified; R3 strengthened (an
attacker-controlled empty 500 removed, driver text no longer surfaced); R3b/
R3c/R5b converted from WARN to enforced; R4 is currently RED BY DESIGN — see
below.

THE DECISION: the migration is committed and NOT applied, per R4 (commit
before apply; the dispatcher applies). The verifier therefore reports
"R4 GHOST MIGRATION: …0003_hardening.sql" until Emiel applies it. That is the
check working, not a defect — but it does mean findings 8, 9 and 13 are fixed
IN CODE and not yet fixed IN THE DATABASE. lib/rate-limit.ts fails OPEN and
logs loudly while the RPC is absent, so an unapplied migration leaves the app
un-metered rather than down.

PROOF OF DONE:
  - [PASS] npx tsc --noEmit
  - [PASS] npm run lint — 0 errors, 0 warnings (was 5 errors, 11 warnings)
  - [PASS] npm test — 27/27 unit tests, including named regression tests for
    the IPv4-mapped-IPv6 bypass, the fc/fd false positive, and the
    &#xFFFFFFFF; RangeError.
  - [PASS] npx tsx scripts/check-conventions.ts — R3b/R3c/R5b green with 13
    recorded exceptions; verified to FAIL on both a new unconfirmed hit and a
    stale exception entry.
  - [PASS] npm run constitution — every static check, R1a RLS, R1b two-org
    probe, typecheck, lint, unit tests.
  - [FAIL] R4 — migration 0003 committed, not applied. EXPECTED; see above.
  - [NOT RUN] the Playwright suite. `npx playwright test --list` resolves all
    48 tests, so the wiring is proven, but the suite was not executed here: it
    drives the live database and performs a real streaming generation against
    the Anthropic API. It must be run before this card is approved.
AUDITOR: not yet reviewed.
WHAT BREAKS IF THIS IS WRONG: the SSRF and forgery fixes are the load-bearing
ones. If private-address.ts is wrong the fetcher reaches internal addresses; if
the 0003 trigger is not applied the audit trail's own comment stays a lie.


---

ROUND 2 — a second adversarial audit, run over the merged tree (this work plus
the concurrent ingestion work). The most serious finding was in round 1's own
code.

WHAT CHANGED:
  - DENIAL OF SERVICE, introduced by round 1 and fixed here. The markup
    stripping in lib/html/readable-text.ts used lazy unbounded regexes
    (`<script>[\s\S]*?</script>`, `<!--[\s\S]*?-->`, `<title>…</title>`). Every
    opening token that never closes makes the engine scan to end-of-input and
    fail, then repeat at the next one — O(openers x length). Measured on that
    code: a benign 5 MB page took 134 ms; 60k unclosed "<script>" plus a 2 MB
    tail took 19.6 s; and a payload INSIDE fetch-url's own 5 MB cap DID NOT
    FINISH IN 600 SECONDS. The blast radius had just grown, because the
    concurrent work added .html file upload at a 20 MB cap through the same
    function, and a self-hosted deployment serves every user from one Node
    process. Replaced with a single forward pass that records absent closing
    tokens instead of re-searching for them: the 600-second payload now takes
    17 ms, and a 19 MB benign page strips in 728 ms. Six regression tests pin
    it, including loose (multi-second) time budgets that fail on a return to
    quadratic behaviour rather than on a slow CI box.
  - maxDuration = 60 declared on both ingestion routes. Neither had one, so a
    pathological input ran until the platform's default killed it — and a
    platform kill returns an opaque non-JSON error page, breaking these
    routes' own promise that a non-2xx always carries a readable `error` (R3).
  - REVERTED round 1's activity-log batching. Round 1 claimed ~200 blocking
    round-trips costing 10-15 s. Measured against the real table: a finished
    run persists 21-34 rows, not ~200, and the mean gap between them is 1.83 s
    against the 120 ms flush window — only 5 of 20 gaps in a sampled run fell
    inside it. So ~90 lines of buffer/timer/flush-chain machinery coalesced
    about five inserts, on the path carrying the product's headline feature.
    The measurement is now recorded in the code so the next person can
    re-derive the decision instead of re-doing the optimisation.
  - lib/ingest/sanitize.ts no longer uses regex lookbehind. It is imported by
    a CLIENT component, so the literal is parsed by the browser; lookbehind
    only reached Safari in 16.4, and anywhere older it is a SyntaxError at
    module parse time that takes down the whole chunk. Rewritten to match a
    well-formed surrogate pair first and capture only the unpaired case. The
    existing sanitize tests pass unchanged, which is the equivalence proof.
  - lib/ingest/file-types.ts pointed at "migration 0003" twice for the ext
    widening; that is 0004 (0003 is this card's hardening migration). Dead
    pointers are catches #20 and #21 in this project's own log.
  - lib/rate-limit.ts now admits its fixed-window burst: a caller spending the
    ceiling at the end of one window and again at the start of the next gets
    up to 2x the nominal rate briefly. Seen directly while testing.
  - e2e/p5-upload.spec.ts cleanup assertion fixed. It asserted
    `main.getByText("e2e-upload")).toHaveCount(0)` after deleting the
    document — which contradicts a deliberate product guarantee: audit lines
    SURVIVE the deletion of what they describe (D07; migration 0002 does it
    with `on delete set null`). All four fixtures share the stem, nothing can
    remove audit rows through the app (no DELETE policy, by design), so the
    assertion drifted closer to failing with every run the suite ever made.
    At 89 surviving rows it failed. It was never testing deletion; it was
    testing that the audit trail had not yet grown visible. Now asserts the
    tile's own control is gone.

  - e2e/p6-generation-handoff.spec.ts label assertion made exact. It asserted
    `reader.getByText("GROUNDED IN")` inside the READING VIEW, whose body is
    model-generated prose, and getByText matches substrings. A run that wrote
    "Because the source is limited, this briefing is grounded in ..." made the
    locator resolve to two elements and the test died on a strict-mode
    violation. The same suite had passed minutes earlier — the briefing simply
    used different words. Any UI label asserted loosely on that surface can be
    broken at random by the product's own output.

TWO TEST BUGS, BOTH REAL, BOTH FOUND BY RUNNING THE SUITE REPEATEDLY:
  Neither was flakiness in the usual sense — each had a specific cause that
  would recur, and each was found only because the suite was run four times in
  a row rather than once. The upload-cleanup assertion degraded monotonically
  with the audit trail's size; the handoff assertion depended on which words
  the model chose. A suite run once per change would have shown both as
  "intermittent" and taught nobody anything.

KNOWN AND DELIBERATELY NOT FIXED (stated, not hidden):
  - Content sniffing maps any ZIP to DOCX, so an EXTENSIONLESS .xlsx gets a
    generic mammoth failure instead of the named refusal that exists for the
    .xlsx extension. Reading the zip's central directory to tell them apart is
    a real change to someone else's actively-edited module for a narrow case.
  - UTF-16 text files are refused by looksLikeText (~50% NUL bytes against a
    5% threshold) though they are readable text and common on Windows. Fixing
    it means BOM detection plus a decode path, not a threshold tweak.

PROOF OF DONE (round 2):
  - [PASS] npx tsc --noEmit; npm run lint (0 errors, 0 warnings)
  - [PASS] npm test — 53/53, incl. 6 new DoS regressions and the 7 original
    extractor tests unchanged (behaviour-preservation evidence)
  - [PASS] npx tsx scripts/check-conventions.ts — and it CAUGHT THIS WORK:
    reverting the batching removed a catch block whose exception was recorded,
    and the stale-entry detector failed the build until the entry was removed.
  - [PASS] npm run constitution — fully green, all four migrations tracked
  - [PASS] adversarial probes re-run live: audit-actor forgery blocked
    (requested 'SYSTEM' and 'ANA', both stored as 'ADMIN'); rate limiter
    enforces 20/5min on fetch-url with p_limit not injectable, unknown bucket
    failing closed, and the counter table unreachable
