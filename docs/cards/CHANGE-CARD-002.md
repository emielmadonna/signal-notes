CHANGE CARD #002
STATUS: APPROVED by Emiel, 2026-09-01 (in session; merged by dispatcher)
WHAT CHANGED: The database exists: seven tables (organizations, members,
documents, briefings, briefing sources, feedback, generation events), every
one protected by organization-scoped row security, plus the seed script (two
realistic orgs) and the two-org probe that attacks the walls from outside.
FILES: supabase/migrations/20260901000001_foundation.sql, scripts/seed.ts,
scripts/two-org-probe.ts, .env.example.
CONSTITUTION RULES TOUCHED: 1 (org-scoped RLS, proven), 2 (named columns),
3 (every write's error checked), 4 (committed BEFORE applied, verified after).
THE DECISION: Cross-table references are enforced by composite foreign keys
(id + org_id pairs) so the database itself refuses a child row whose parent
belongs to another organization — policies alone could not see through foreign
keys. The activity log is append-only and grounding links are write-once (their
update policies were deliberately dropped). Chosen model column and event-kind
column are in from day one (streaming + model selection need them).
REJECTED: RLS-only enforcement (the exact hole the auditor caught); nullable
org_id (a silent isolation escape); blind upserts in seed (mask errors).
PROOF OF DONE:
  - [PASS] Committed 3b87d55 at 02:53 → applied 02:54 → verified: tracking row
    + all 41 columns live (shiplog/evidence/r4-migration-0001-verified-*.txt)
  - [PASS] Two-org probe 16/16, incl. composite-FK rejections code 23503
    (shiplog/evidence/r1-probe-20260901-025459.txt)
  - [PASS] Ghost-migration gate observed failing pre-apply and passing
    post-apply (both verifier reports on file)
  - [PASS] Full constitution green 02:54 (constitution-20260901-025459.txt)
AUDITOR: PASS (2nd attempt). 1st attempt REJECTED: cross-org reference hole in
all three child insert policies, probe covering only the documents table, and
a seed path that could lock the probe out of sign-in forever. Catches #5, #6,
#7 — all closed and re-verified, then proven against the live database.
WHAT BREAKS IF THIS IS WRONG: the worst bug class in multi-tenant software —
one organization reading or writing another's data.
