CHANGE CARD #009
STATUS: APPROVED by Emiel, 2026-09-01 (in session; 1:1 surfaces verified; merged by dispatcher)
WHAT CHANGED: Opening a document shows it in full with inline title/body
editing, its "used in" briefings, and its file history; renaming and deleting
work from the selection bar. A link to a document that isn't yours (or doesn't
exist) shows the quiet "This page doesn't exist" — tenant isolation's face.
FILES: app/documents/[id]/, components/document-sheet/*,
lib/document-actions.ts, components/workspace/workspace.tsx (wiring).
CONSTITUTION RULES: 1 (cross-org id → not-found via RLS), 2, 3 (every write +
partial-failure surfaced honestly), 9 (abort; malformed-id → not-found vs
error), 10 (optimistic rename/delete, working buttons).
THE DECISION: A cross-org or missing id renders not-found (never an error dump
or blank); a malformed id (bad uuid) also → not-found; only genuine fetch
failures → retryable error. Title edits append an audit line as a separate
write, so a failed audit never un-saves the rename — the copy says exactly what
happened. REJECTED: treating every failure the same; all-or-nothing delete.
PROOF OF DONE:
  - [PASS] Live E2E: open sheet + real body + file history; rename → SAVED +
    history line + optimistic tile; single/multi delete with confirm; cross-org
    id → not-found. Screenshots in shiplog/evidence/p3-live/.
  - [PASS] tsc/build/constitution green; not-found branch code confirmed.
AUDITOR: PASS. Card notes: module-state patch handoff judged safe (per-tab,
confirmed patches only); used-in rail meta shows date·status vs canvas
date·sources·rating (needs counts — backlogged).
WHAT BREAKS IF WRONG: a cross-org leak wearing a 404, or silent edit loss.
