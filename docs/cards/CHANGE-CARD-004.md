CHANGE CARD #004
STATUS: PENDING-EMIEL
WHAT CHANGED: The safety net now runs by itself: every push to GitHub runs the
constitution verifier, the type checker, and a full build. The verifier can
also query the live database from this machine (it lacked the standard
database tool), and it refuses to run database checks against anything but the
pinned Signal Notes project.
FILES: .github/workflows/ci.yml, scripts/db-query.ts, scripts/constitution.sh
(live-check wiring + project pin + Anthropic-key leak checks), docs/catch-log.md.
CONSTITUTION RULES TOUCHED: the verifier itself (gates every merge and deploy);
key hygiene; R4's ghost-migration detector now armed in CI.
THE DECISION: CI runs static checks always and live database checks only when
Emiel adds DATABASE_URL/SEED_USER_PASSWORD as GitHub secrets — the verifier
degrades honestly (WARN, not silent pass) without them. The project-ref pin
exists because of catch #4: a pre-connected production database for another
product was one command away from receiving our schema.
REJECTED: putting live secrets into CI myself (credentials stay with Emiel);
skipping live checks locally (the pg-based helper keeps them runnable here).
PROOF OF DONE:
  - [PASS] Full constitution green locally with live DB checks 02:54
  - [PASS] Pin check proven: verifier passes with matching ref
  - [PENDING] First CI run on GitHub — triggered by this branch push; result
    to be pasted here when the run completes.
AUDITOR: reviewed as dispatcher-harness work across both audit rounds (no
findings raised against it); the auditor independently exercised the verifier
in every review.
WHAT BREAKS IF THIS IS WRONG: everything quietly — this is the machinery that
catches everything else.
