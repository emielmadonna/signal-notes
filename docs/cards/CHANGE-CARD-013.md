CHANGE CARD #013
STATUS: PENDING-EMIEL
WHAT CHANGED: The hardening + verification sweep. A committed end-to-end test
suite now drives every route and surface of the real app against the real
database: sign-in and the auth wall, all four document states incl. forced
failures, every file type, the composer, a REAL streaming generation, the
reading view with citations/feedback/audit, cross-org not-found, theme
persistence, and 768px on every surface. The dev-only design gallery is
deleted.
FILES: e2e/p5-routes|failures|responsive|isolation|theme.spec.ts,
e2e/helpers.ts, e2e/p2-visual.spec.ts (gallery test removed), and DELETED
app/design/. SHIPLOG.md sections 1-4 filled.
CONSTITUTION RULES: the verification of all ten, end to end, in a browser.
THE DECISION: Failures are forced at the network layer (route interception),
so the app ships unmodified — no test-only hooks in product code. The cross-org
id is derived live in-browser, not hardcoded. The gallery is gone (its own
header promised deletion in P5).
PROOF OF DONE:
  - [PASS] Full Playwright suite: 42/42 green (independently re-run by the
    dispatcher), incl. a real ~56s streaming generation.
  - [PASS] Auth wall: every page → /signin?next=; every API → 401 JSON (table
    in the card / SHIPLOG).
  - [PASS] Forced-500 → error state distinct from empty, retry recovers.
  - [PASS] 768px: scrollWidth == clientWidth on all 7 surfaces.
  - [PASS] Cross-org: Marta → org-A doc/briefing/generating all not-found, no
    org-A content, no error dump.
  - [PASS] tsc/build (no /design route)/constitution all green; both migrations
    tracked; 24/24 probe.
  - Evidence: shiplog/evidence/p5-{routes,failures,768,isolation,theme}/ +
    p4-live/ (18+ screenshots).
AUDITOR: sweep is test-only + a dead-code deletion; the dispatcher independently
re-ran the full suite (42/42) and re-verified the route table and constitution.
WHAT BREAKS IF THIS IS WRONG: nothing ships unverified — this is the gate that
turns "it should work" into "here is the browser doing it."
