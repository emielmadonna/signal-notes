# D04 — Citations verified server-side against the source

**DECISION.** Every citation is verified on the server at generation time: each
quote must be a real substring of the document it names, or it is dropped and
does not count. Nothing the model *claims* to have quoted survives unless the
server can find that exact passage in the named source. The reading view then
resolves each citation's `document_id` against the briefing's real sources, so
every hover is genuinely traceable — a glass box, not a decorative footnote.

**ALTERNATIVES REJECTED, AND WHY.**
- *Trust the model's quotes.* Rejected because a fabricated quote in a tooltip
  turns the glass box into a mirror: users trust what they can trace, and a
  quote that isn't in the source is a lie wearing a citation.
- *Verify only at read time / trust stored quotes.* Rejected — verification
  happens at generation, so unverifiable quotes never get stored at all.

**EVIDENCE.**
- Cards: CHANGE-CARD-010 (THE DECISION: server-side substring verification,
  unverified dropped), CHANGE-CARD-012 (reading view resolves `document_id`
  against real sources).
- Proof: a real run produced 19/19 citations verified word-for-word; the
  dispatcher independently re-queried the database and confirmed all 19 quotes
  are genuinely present in their 3 named source docs. Reading-view tooltip shows
  a real quote ("We hired athletes and gave them no plays."). Screenshots
  `shiplog/evidence/p4-live/reading-view.png`, `citation-tooltip.png`; the
  "…7 of 9 verified" CHECK line is on the generation-complete shot.

**THE LIKELY PUSHBACK / ANSWER.**
"What stops the AI from inventing a quote?" — Server-side substring check at
generation; if the quote isn't a real substring of its named doc it is dropped
and never stored. Independently DB-verified: 19/19 resolve to their 3 sources.
