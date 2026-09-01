# SHIPLOG — Signal Notes

> This is a live diary: entries are written at the moment they happen, with real
> timestamps. Nothing here is reconstructed after the fact. Evidence files live
> in shiplog/evidence/ and are referenced by name.


## How this was built (harness disclosure)

I don't hand-type code. I built a review system before the clock started and
disclosed it here on purpose: work moves Dispatcher -> Builder -> Auditor ->
Change Card -> me. Every task requires proof-of-done (pasted output, live query,
screenshot); a separate auditor agent tries to reject every change; `npm run
constitution` gates every merge; and every claim below links to its evidence
file. The prompts, protocol, and verifier are all in this repo. Ask me anything
in the walkthrough and I'll show the proof rather than the vibes.

What was built before "go": my own generic tooling only (this template, the
constitution file, agent prompts, verifier skeleton, the design system prompts).
All Signal Notes application code, schema, and migrations: after "go".

---

## 1. What I verified, and how (per rule)

> Format per entry: the claim, the exact command/query, the pasted result or
> evidence filename, date. "Verified" means I (or my harness, which I ran)
> observed the result. Anything I did NOT verify is listed at the bottom of this
> section under ASSUMED, honestly.

### R1 — Tenant isolation (proven, not assumed)
- [ ] RLS enabled + policy present on every table. Query + output: evidence/r1-rls-tables.txt
- [ ] Two-org probe: signed in as user A (Org 1) and user B (Org 2); cross-org
      selects return 0 rows; cross-org insert/update rejected. Script:
      scripts/two-org-probe.ts. Output: evidence/r1-probe-YYYYMMDD.txt

### R2 — No wildcard selects
- [ ] Verifier select-check output: evidence/r2-selects.txt

### R3 — Every write's { error } surfaced
- [ ] Verifier catch/error-check output + forced-failure screenshots per write:
      evidence/r3-*.png

### R4 — Migrations verified live
> One block PER migration file:
- [ ] supabase/migrations/____.sql — applied on: ____
      information_schema.columns result: [paste]
      migrations tracking row for this version: [paste]

### R5 — Prompts in one module
- [ ] Verifier inline-prompt check: evidence/r5-prompts.txt

### R6 — Grounding displayed
- [ ] Screenshot: briefing view with sources panel: evidence/r6-grounding.png

### R7 — Feedback stored
- [ ] Rated + annotated in UI, then queried the row: [paste] evidence/r7-feedback.txt

### R8 — Narrated generation
- [ ] Mid-generation screenshot of activity log: evidence/r8-narration.png

### R9 — Aborts + honest non-2xx
- [ ] Forced 500 on list fetch: error state screenshot (distinct from empty):
      evidence/r9-error-state.png
- [ ] Abort-on-unmount: [how verified]

### R10 — Loading states + optimistic updates
- [ ] Screen recording of edit flow: evidence/r10-edit.mp4 (or gif)

### ASSUMED, not verified
- [honesty section: list anything you didn't get to, and what it would take]

---

## 2. What the AI got wrong, and how I caught it

> Distilled from docs/catch-log.md (full log committed). Format: CLAIM / VICTIM
> (the concrete failure it would have caused) / THE CATCH (the act + evidence) /
> FIX + SYSTEM CHANGE. Strongest 3-4 below; the raw log has all of them.

### Catch 1
- CLAIM:
- VICTIM:
- THE CATCH:
- FIX + SYSTEM CHANGE:

### Catch 2
### Catch 3
### Catch 4

---

## 3. The rule I'd push back on

> One rule, a real argument, and the condition under which I'd still follow it.

---

## 4. What I'd do with another week

> Ranked, with the why. Not a feature wishlist: what the system needs next.
