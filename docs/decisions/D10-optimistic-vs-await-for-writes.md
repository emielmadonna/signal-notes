# D10 — Optimistic updates vs await-before-paint for writes

**DECISION.** List mutations and the feedback rating update local state
optimistically instead of refetching the world — the felt-quality goal of rule
10. But the build surfaced the tension honestly: the "Useful" rating paints
success the instant it's clicked while the write is still in flight, so a reload
within ~1s could show success for a save that hadn't landed. The position taken
(SHIPLOG section 3) is to keep optimism for cheap, low-stakes, easily-reverted
edits (rename, selection toggle) and move consequential writes toward
await-before-paint — not to delete rule 10, but to scope it.

**ALTERNATIVES REJECTED, AND WHY.**
- *Refetch the world after every write.* Rejected in card 007 for felt quality —
  a full re-read on every mutation is slow and janky.
- *Blanket optimism as the default* (rule 10 as written: "optimistic instead of
  refetching"). Argued against — optimism silently assumes the write succeeded,
  which collides with rule 3 (surface every error) for consequential writes.

**EVIDENCE.**
- Cards: CHANGE-CARD-007 (optimistic list mutations chosen), CHANGE-CARD-012
  (feedback is a single upsert on `(briefing_id, user_id)`; the optimistic
  rating is NOT awaited before the UI updates — the race is named on the card's
  ASSUMED list).
- SHIPLOG section 3 ("The rule I'd push back on") builds the full argument;
  SHIPLOG ASSUMED list records the un-awaited rating race; SHIPLOG section 4
  item 3 proposes await-before-paint for consequential writes as the fix.
- Proof: optimistic rename → SAVED + optimistic tile, delete → tile gone,
  rating persists across reload (the E2E lets the write settle) — E2E
  p3-documents + p4; revert-on-error path required in review (CHANGE-CARD-007).

**THE LIKELY PUSHBACK / ANSWER.**
"Optimistic UI can show success for a write that failed — isn't that a rule-3
violation?" — Yes for consequential writes, which is exactly my pushback: keep
optimism for cheap reversible edits, await-before-paint for anything a person
relies on (SHIPLOG section 3); the revert path is tested to fire.
