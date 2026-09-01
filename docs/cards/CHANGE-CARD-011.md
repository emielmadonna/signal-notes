CHANGE CARD #011
STATUS: APPROVED by Emiel, 2026-09-01 (in session; 1:1 surfaces verified; merged by dispatcher)
WHAT CHANGED: You can now compose a briefing (pick documents, pick the AI model)
and watch it being written live — the briefing text streams in with a blinking
cursor while a timestamped activity log shows the AI planning, reading each
document, thinking, and drafting. Close the tab and reopen it: the run is still
going, and the view catches up from where it is.
FILES: app/compose/, app/briefings/[id]/generating/, components/compose/*,
components/generation/*, lib/use-generation-stream.ts, e2e/p4-briefings.spec.ts,
components/workspace/workspace.tsx (two wiring edits).
CONSTITUTION RULES: 6 (grounded-in source chips), 8 (streaming body + labeled
thinking/tool log, no bare spinner), 9 (aborts on unmount; run continues
server-side; non-2xx surfaced), 10 (working Generate button).
THE DECISION: The generation surface RESUMES a run via the events-replay
endpoint rather than driving the live POST stream — so a freshly-started run
and a reopened one use the exact same code path, and navigating never restarts
or duplicates the run. The MODEL PICKER (your requirement, D1) offers the three
allowlisted models; the progress bar grows with real steps rather than a faked
percentage. REJECTED: inventing a step total the engine doesn't advertise;
driving the token stream through the navigation (would re-POST or reset).
PROOF OF DONE:
  - [PASS] LIVE E2E: a real briefing generated end to end in a browser in ~56s
    — landed on the generation surface, the labeled log filled, it completed
    with "13 STEPS · 52.8S", GROUNDED-IN chips, and the CHECK "…7 of 9 verified"
    line. Screenshots shiplog/evidence/p4-live/.
  - [PASS] Composer zero-selected copy + model picker; existing complete
    briefing resumes via events replay.
  - [PASS] tsc/build/constitution green; SSE parser matches the real wire format.
AUDITOR: PASS. Notes: tag sub-labels string-match engine status content (§4-
sanctioned, degrades gracefully — shared-vocab constant backlogged); the live
E2E spec is dispatcher-claimed.
WHAT BREAKS IF THIS IS WRONG: the signature experience — if it faked a spinner
or a percentage, rule 8's whole point is lost.
