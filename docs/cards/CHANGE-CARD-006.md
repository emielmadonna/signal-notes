CHANGE CARD #006
STATUS: PENDING-EMIEL
WHAT CHANGED: The database now knows everything the approved design needs:
documents carry their file details (name, type, size — existing rows
backfilled), briefings can be deleted and can store their structured sections
and citations, margin notes have a home, and there is an append-only audit
trail that cannot be forged or silently emptied.
FILES: supabase/migrations/20260901000002_canvas_schema.sql, scripts/seed.ts,
scripts/two-org-probe.ts.
CONSTITUTION RULES TOUCHED: 1 (org-scoped RLS + composite FKs on both new
tables, probe now 24 checks), 2, 3, 4 (committed→applied→verified, evidence
pasted).
THE DECISION: Two decisions the auditor forced, both better than my spec:
(a) audit lines are PINNED to the signed-in user — any member could otherwise
have written lines under a colleague's name or as "SYSTEM" (catch #14);
(b) audit rows SURVIVE the deletion of their briefing/document — cascade would
have let a delete erase its own history (catch #15). REJECTED: free-text actor
trust; cascade on audit rows; an at-least-one-subject check (survivor rows may
legitimately outlive both subjects — commented in the file).
PROOF OF DONE:
  - [PASS] R4 ritual: file committed (card-006 commit) → applied 04:23 →
    verified: both tracking rows + every new column live + backfill correct.
    shiplog/evidence/r4-migration-0002-verified-20260901.txt
  - [PASS] Probe 24/24 as both users: new tables reject cross-org composite-FK
    attacks with code 23503; cross-org reads return 0 rows (own org proven
    non-empty first, so the zero is not vacuous).
    shiplog/evidence/r1-probe-final-24checks.txt
  - [PASS] R1a: RLS enabled + policies on all 9 public tables.
AUDITOR: PASS (2nd attempt; 1st REJECT with catches #14, #15 + four minor
findings, all addressed). ASSUMED-list items accepted: a deleted user's audit
rows become identity-indistinguishable from SYSTEM (display text survives);
the forgery-REJECTION path itself is not yet probe-exercised (backlogged for
the P5 sweep).
WHAT BREAKS IF THIS IS WRONG: the audit trail is the product's accountability
story — a forgeable or self-erasing one would be worse than none.
