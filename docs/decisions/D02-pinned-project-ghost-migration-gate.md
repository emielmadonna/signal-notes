# D02 — Pinned Supabase project + ghost-migration gate

**DECISION.** The Signal Notes project ref is PINNED in the repo
(`supabase/PROJECT_REF`) and the verifier refuses to run any live database check
whose link or `DATABASE_URL` is not that project. On top of that, a
ghost-migration gate checks that every file in `supabase/migrations/` has a
matching row in the migrations tracking table and that every column it declares
actually exists in `information_schema`. CI runs static checks always and live
DB checks only when the secrets are present — degrading honestly to WARN, never
a silent pass.

**ALTERNATIVES REJECTED, AND WHY.**
- *Trust the connected database.* Rejected because the connection the agents
  were handed pointed at a live production database for a *different* product
  (~300 applied migrations, its own `organizations` table). Applying our
  migration there would have collided with production schema.
- *Put live secrets into CI myself.* Rejected — credentials stay with Emiel;
  the verifier degrades to WARN without them rather than pretending to pass.
- *"It looked done in git" as proof of applied.* Rejected — that is the exact
  Part C production-trauma failure mode; the gate proves applied, not committed.

**EVIDENCE.**
- Cards: CHANGE-CARD-004 (THE DECISION: static-always, live-only-with-secrets,
  the project-ref pin), CHANGE-CARD-002 (the ghost-migration detector observed
  FAILING pre-apply and PASSING post-apply — the gate works both directions).
- Catches: #4 (read-only `list_migrations`/`list_tables` before any write
  revealed the foreign production database; zero writes sent), #10 (first CI run
  failed honestly on missing generated route types), #11 (the probe failed
  opaquely in CI until the evidence artifact surfaced the real cause).
- Proof: `shiplog/evidence/r4-wrong-project-migrations.txt`,
  `r4-blank-project-proof-20260901.txt`, constitution reports showing the ghost
  gate FAIL then PASS (`constitution-20260901-023502.txt` /
  `-025459.txt`). This is the repo's Part C structural answer, by filename.

**THE LIKELY PUSHBACK / ANSWER.**
"How do you know a migration actually ran, not just got committed?" — The gate
matches every migration file against the live tracking row and
`information_schema` columns; it is on file failing before apply and passing
after (constitution reports).
