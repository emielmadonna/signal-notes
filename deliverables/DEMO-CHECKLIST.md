# Walkthrough demo checklist (P7)

The live hour is the one thing no harness runs for you. This is the pre-flight
and the demo script. Rehearse the tenant-isolation moment twice — it is the
best 20 seconds of the hour.

## 30 minutes before — tech check
- [ ] Deployed URL loads and you can sign in. If it's still behind Vercel SSO,
      resolve access FIRST (disable deployment protection, or have a shareable
      link ready). This is the one blocker that ruins a walkthrough.
- [ ] Two browser profiles open, each signed in to a DIFFERENT org:
      - Profile A: ana@northwind-advisory.test  (Northwind Advisory)
      - Profile B: marta@meridiangroup.test     (Meridian Group)
      (password: the SEED_USER_PASSWORD from .env.local)
- [ ] Ana's workspace has the real COMPLETE briefing to open:
      /briefings/345eef7d-ace6-486e-ba49-2d38a4a7f37a
- [ ] `npm run constitution` run once locally — screen it if asked "prove it."
- [ ] Terminal ready in the repo for: the two-org probe, the verifier, git log.
- [ ] Screen share tested once (the browser + one terminal pane).

## The demo, in order (each beat ties to a decision card)
1. SIGN IN as Ana → the workspace. One line: "one screen, everything is a sheet
   over it; dark by default." (D09)
2. OPEN the complete briefing. Hover a citation → the tooltip shows the exact
   source passage. "Every claim traces to your own document — the glass box."
   (D03, D04, rule 6)
3. Rate it Useful → it sticks. Open the GENERATION LOG → the real narration
   replays (planning, reading each doc, thinking). "No spinner — it says what
   it's doing." (rule 7, rule 8)
4. Toggle the AUDIT TRAIL → append-only, org-scoped, pinned to the actor. (D07)
5. THE ISOLATION MOMENT (rehearse this): in Profile B (Marta), paste the URL of
   Ana's document or briefing. It renders "This page doesn't exist." — not an
   error, not a blank, not Ana's content. "That's tenant isolation wearing a
   404. It's proven by a committed probe that runs in CI, not by me clicking —
   here's the probe." Then show r1-probe-final-24checks.txt / the probe run.
   (D01, rule 1)
6. (Optional, if time + budget) START a new briefing in the composer, pick the
   model, and let it stream live for 20-30s. "This is real — server-side, and
   it keeps running if I close the tab."

## If challenged — where the evidence lives
- "Prove isolation" → scripts/two-org-probe.ts + r1-probe-final-24checks.txt
  (24/24), and it runs in CI on every push.
- "Prove the migration ran" → SHIPLOG §1 R4 + r4-migration-000X-verified-*.txt;
  the ghost-migration gate is scripts/constitution.sh R4 (this is Part C).
- "Prove the citations are real" → the tooltip live, and 19/19 were DB-verified.
- "What don't you know?" → SHIPLOG §1 ASSUMED list. Read it out; don't bluff.
- The frame (say it plainly): "I didn't hand-type this code and I won't pretend
  I did. I built the system that forced every line to prove itself, reviewed
  every change at the decision level, and everything I claim comes with
  evidence. Ask me anything and I'll show the proof."

## Known honest gaps to disclose BEFORE being asked (from Mock-Wren)
- Only claude-sonnet-5 was exercised end-to-end live (opus/haiku validated, not
  each run live).
- The optimistic rating isn't awaited before paint — a sub-second reload can
  race it (works in normal use).
- R5b is a WARN (surfaces prompt-shaped strings for review), not a hard block.
- Part B was late, and the reason is mine to say first: the campaigns PR was in
  the Milestone 0 brief all along and our intake never filed it, so PART-B.md
  sat marked BLOCKED while the source sat in the founding email. An outside
  review caught it, not us. It is executed now (29 findings), the PR is
  committed as deliverables/PART-B-SOURCE.md, and the intake rule that came out
  of it is catch #25 and a line in CLAUDE.md.
