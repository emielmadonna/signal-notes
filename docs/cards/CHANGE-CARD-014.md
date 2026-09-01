CHANGE CARD #014
STATUS: APPROVED by Emiel, 2026-09-01 (in session — direct request)
WHAT CHANGED: The two org accounts are now simple admin logins — admin@admin.admin
(Northwind Advisory) and admin2@admin.admin (Meridian Group). The old
ana@/marta@ demo accounts were removed so each org has exactly ONE admin
member, with no overlap.
FILES: scripts/seed.ts (the two account emails, one source of truth),
scripts/two-org-probe.ts (probe signs in as the new accounts),
e2e/helpers.ts + e2e/*.spec.ts (USERS keys → northwind/meridian, admin emails).
CONSTITUTION RULES: 1 (tenant isolation re-proven with the new accounts, 24/24),
2/3 (seed unchanged in shape).
THE DECISION: Two distinct admin accounts, one per org (there is no admin ROLE
column — the spec asks only for a user per org, so each is admin by being the
sole member of its org). Old users deleted via the service-role admin API;
their org content survives (documents.added_by / briefings.created_by /
audit.actor_user_id are `on delete set null`, so no data was lost — only the
account identity changed). REJECTED: adding a role/permission column (not asked
for, a schema change); leaving the old accounts (would be membership overlap).
PROOF OF DONE:
  - [PASS] Exactly 2 auth users; org_members = admin→Northwind, admin2→Meridian;
    no user in >1 org (overlap query empty).
  - [PASS] Both admins sign in and each sees ONLY its own org (can't see the
    other exists); 6 docs each.
  - [PASS] Two-org probe 24/24 with the new accounts —
    shiplog/evidence/r1-probe-final-24checks.txt.
  - [PASS] scripts tsc clean; constitution green.
NOTE: password is whatever SEED_USER_PASSWORD is set to (unchanged mechanism —
never handled in plaintext by the dispatcher). admin@admin.admin with a weak
password is a demo-login convenience; flagged for Emiel as a security-optics
choice before any external review.
WHAT BREAKS IF THIS IS WRONG: sign-in for the demo, or a membership overlap
that would undercut the tenant-isolation story.
