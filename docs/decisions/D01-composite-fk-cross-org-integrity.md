# D01 — Composite foreign keys for cross-org integrity

**DECISION.** Cross-table references are enforced by *composite* foreign keys —
every parent carries a `unique (id, org_id)` and every child references the
`(id, org_id)` pair, not just `id`. This makes the database itself refuse a
child row (a grounding link, a feedback row, a log line) whose parent belongs to
a different organization. Row-level security still guards every table, but the
integrity of parent/child org agreement is enforced in the schema, below RLS.

**ALTERNATIVES REJECTED, AND WHY.**
- *RLS-only enforcement* (rely on policies alone). Rejected because foreign keys
  bypass RLS: a policy that only checks the row's own `org_id` cannot see that
  the `briefing_id` or `document_id` it points at belongs to another org. This
  was not theoretical — it was the exact hole the auditor found in the first
  migration draft.
- *Nullable `org_id`*. Rejected as a silent isolation escape: a null org column
  is a row that belongs to no one and passes every org check.

**EVIDENCE.**
- Card: CHANGE-CARD-002 (THE DECISION). Reinforced in CHANGE-CARD-006 (both new
  tables carry the same composite-FK discipline).
- Catches: #5 (auditor read all 18 policies and found the three child-table
  INSERT policies checked only the row's own `org_id`) and #6 (the first probe
  only touched the documents table, so it would not have caught #5).
- Proof: two-org probe 16/16, including cross-org composite-FK insert attempts
  rejected with Postgres code 23503 — `shiplog/evidence/r1-probe-20260901-025459.txt`.
  Extended to 24/24 after migration 0002 —
  `shiplog/evidence/r1-probe-final-24checks.txt`. Runs in CI on every push.

**THE LIKELY PUSHBACK / ANSWER.**
"Isn't RLS enough on its own?" — No; foreign keys bypass RLS, so a member could
attach another org's document to their own briefing. The probe proves the
composite FK rejects exactly that with code 23503 (r1-probe evidence).
