# D03 — The `read_document` tool grounding approach

**DECISION.** The model does not receive document bodies pre-loaded into its
prompt. Instead it reads through a `read_document` tool that is constrained to
the briefing's own bound, org-scoped sources — it literally cannot open any
document outside that set. Because the model has to *call the tool to read*, the
narration ("Reading document 'Acme call, Aug 12'") is a real event, not theater;
the activity log reflects work the model actually did.

**ALTERNATIVES REJECTED, AND WHY.**
- *Dump all selected document bodies into the prompt.* Rejected because then the
  reading is invisible and the narration becomes decorative — a fake status line
  over a black box. Rule 8 (narration) would be satisfied only in appearance.
- *Let the model reach any document.* Rejected — the tool is org-scoped and
  bound to the briefing's sources so containment is a property of the code, not
  a hope about the prompt.

**EVIDENCE.**
- Card: CHANGE-CARD-010 (THE DECISION), CHANGE-CARD-011 (the live surface shows
  the labeled read events streaming).
- Proof: a real end-to-end run as seeded Ana on her real docs — the event stream
  was real and ordered (plan → think → read each doc as labeled tool calls →
  themes → text). `read_document` containment and org-scoping proven; the DB is
  the source of truth, the live stream is best-effort on top. Mid-run and
  complete screenshots in `shiplog/evidence/p4-live/`.

**THE LIKELY PUSHBACK / ANSWER.**
"How do I know the narration isn't fake?" — The model can only read via a tool
call, so each "Reading …" line is a real tool event persisted as a
`generation_events` row; the stream in p4-live shows them arriving in order.
