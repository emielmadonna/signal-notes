# D07 — Audit trail pinned to the signed-in user + survives deletion

**DECISION.** Two decisions the auditor forced, both better than the first spec:
(a) every audit line's actor is pinned to the signed-in user
(`actor_user_id = auth.uid()`), SYSTEM lines are writable only server-side, and
the display name is derived server-side — never client-supplied; (b) audit rows
SURVIVE the deletion of their briefing or document (`on delete set null` blanks
the link but keeps the line, org-scoped), so history is not erased exactly when
it matters most.

**ALTERNATIVES REJECTED, AND WHY.**
- *Free-text actor with only org-membership checked.* Rejected — any member
  could write lines under a colleague's name or as "SYSTEM"; a forgeable audit
  trail lends forged lines authority, which is worse than having none.
- *Cascade delete on audit rows.* Rejected — deleting a briefing would silently
  purge its entire history, contradicting the file's own "nobody can make it
  disappear" promise.
- *An at-least-one-subject constraint.* Rejected — survivor rows may legitimately
  outlive both their briefing and their document (noted in the migration).

**EVIDENCE.**
- Card: CHANGE-CARD-006 (THE DECISION states both, crediting the auditor).
- Catches: #14 (actor was free text while every other writable table pinned
  identity — migration line 119 + 150-154), #15 (cascade rules directly
  contradicted the append-only comment — lines 128/132 vs 147-149). Both caught
  BEFORE the migration was applied.
- Proof: two-org probe 24/24 (`r1-probe-20260901-042430.txt`); R4 verified paste
  `r4-migration-0002-verified-20260901.txt` (audit_events 9 cols incl.
  actor_user_id). Honest limit (ASSUMED): a deleted user's rows become
  identity-indistinguishable from SYSTEM (display text survives); the
  forgery-rejection path is not yet probe-exercised.

**THE LIKELY PUSHBACK / ANSWER.**
"Could a user forge an audit line, or make one vanish?" — No; the actor is
pinned to auth.uid() (catch #14) and rows survive their subject's deletion
(catch #15) — both caught and fixed before apply, and the columns are on file.
