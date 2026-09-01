CHANGE CARD #017
STATUS: PENDING — awaiting Emiel.

WHAT CHANGED: the pre-submission pass — SHIPLOG brought current with the repo,
CI confirmed green on the exact head being submitted, the constitution gate run
fresh with its evidence committed, and the deployed site confirmed to be the
current main. Docs and evidence only; zero product code in this card.

  SHIPLOG.md brought current:
  - §2's framing was stale ("strongest of 19 logged catches"; the log holds
    25). Count corrected, and catch #25 PROMOTED into the featured set as
    Catch 5 — an externally-caught miss ("we don't have the source" taken as a
    premise instead of tested as a claim) with an ownership answer and a
    system change (the CLAUDE.md intake rule) is the strongest catch class in
    the log. The existing four stay: each is a distinct failure class.
  - New dated §5.6: Part B was executed against the committed source
    (deliverables/PART-B-SOURCE.md) — 29 ranked findings, 5 × S0 — late, and
    why (catch #25; the intake rule that came out of it). Three sentences, no
    spin.
  - The production URL added to the SHIPLOG header, README.md, and
    deliverables/DEMO-CHECKLIST.md.

  DEMO-CHECKLIST corrected while adding the URL (it would have sunk the live
  hour as written):
  - It still told the presenter to sign in as ana@…/marta@….test — accounts
    REMOVED by card-014. Now the two admin accounts.
  - It still pinned briefing 345eef7d-…, deleted since; pinned briefing ids
    going stale is catch #22, so the checklist now says pick the card from the
    workspace before the demo, and does not pin an id.

PROOF-OF-DONE:
  1. CI green on the submitted head (not an older one):
     - main = 77c9d2d "e2e: p3-delete fixtures run as the signed-in user" at
       the time of this pass; run 33568902030, completed SUCCESS in 6m13s —
       https://github.com/emielmadonna/signal-notes/actions/runs/33568902030
     - First green run in which the live-generation e2e executes (the
       ANTHROPIC_API_KEY repo secret landed today).
     - The push carrying THIS card triggers its own run; the submission stands
       on that run being green too, and it contains docs/evidence only.
  2. Constitution gate, fresh, 2026-09-01 16:01 local:
     - PASS on every check: R2/R3/R3b/R3c/R5b, KEY (server-only), PIN
       (rqvyiclwhihhsxymenrp), R1a RLS on every table, R4 migrations
       0001-0004 tracked live, R1b two-org probe, typecheck, lint, unit.
     - Evidence committed with this card:
       shiplog/evidence/constitution-20260901-160150.txt
       shiplog/evidence/r1-probe-20260901-160150.txt
  3. Deployed site matches current main:
     - https://signal-notes-three.vercel.app serves the newest production
       deploy of main (Vercel redeploys on every push; verified Ready after
       77c9d2d landed).
     - Live production verification on this deploy, run today from this
       machine: every accepted upload format lands (PDF/DOCX/RTF live via the
       lazy engine; TXT/CSV/HTML/no-extension via the probe suite; .doc gets
       its named 415); the full p3 document lifecycle passes against
       production (add-sheet overlay, paste, upload, rename, delete, search);
       and a real briefing generated end-to-end in 44 s — 11/11 citations
       verified — with the surface auto-opening the reading view and the log
       collapsed (p6-generation-handoff: 2 passed against production).

  Also in this pass, folded from the hardening session after verification:
  cards 015 (linear-time HTML stripping, extraction deadlines, batching
  revert) and the stale-tile delete fix, both already on main with CI green.
