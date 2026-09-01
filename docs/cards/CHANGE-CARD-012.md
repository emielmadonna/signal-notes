CHANGE CARD #012
STATUS: PENDING-EMIEL
WHAT CHANGED: Reading a finished briefing. The editorial paper page shows the
briefing with every claim carrying a citation you can hover to see the exact
source passage and which document it came from; a Useful / not-useful control
that saves and is remembered; margin notes you can leave and delete; a replay
of the AI's work; and the append-only audit trail.
FILES: app/briefings/[id]/page.tsx, components/briefing-view/*,
lib/briefing-actions.ts.
CONSTITUTION RULES: 1 (cross-org/missing id → not-found, RLS the only wall),
2, 3 (every write surfaced), 6 (citations trace to the real source passage —
the glass box), 7 (feedback + notes stored, rated state persists), 10
(optimistic rating/notes, working states).
THE DECISION: Citations render the server-verified quote and resolve their
document_id against the briefing's real sources, so every hover is genuinely
traceable — not a decorative footnote. Feedback is a single upsert on
(briefing_id, user_id) so re-rating flips in place. A non-complete briefing
redirects to the live generation surface; a bad/foreign id shows not-found.
REJECTED: trusting stored quotes without the generation-time verification
(done in card 010); a markdown renderer (plain text nodes — no injection).
PROOF OF DONE:
  - [PASS] LIVE E2E on the real briefing: title, GROUNDED-IN chips, citation
    superscript → tooltip showing the real quote "We hired athletes and gave
    them no plays.", rate Useful → persists across reload (DB row confirmed),
    audit trail table with the real RUN STARTED…COMPLETE events. Screenshots
    shiplog/evidence/p4-live/ (reading-view, citation-tooltip, feedback-rated,
    audit-trail).
  - [PASS] Independent DB check: all 19 citations resolve to the 3 real sources.
  - [PASS] tsc/build/constitution green; no dangerouslySetInnerHTML.
AUDITOR: PASS. ASSUMED-list items: no "un-rate" affordance (feedback has no
delete policy — flip only); optimistic rating is not awaited before the UI
updates, so a reload within ~1s of clicking can race the write (works in normal
use; the E2E allows the write to settle). Header shows an id fragment, not a
sequential briefing number (honest, canvas showed "041").
WHAT BREAKS IF THIS IS WRONG: rule 6 and 7 — if a citation didn't trace, or a
rating didn't store, the product's trust-and-feedback promises are hollow.
