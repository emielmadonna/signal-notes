# TOUR — Signal Notes repo walkthrough (Part D)

Ordered click-through to tell the build's story in ~5-7 minutes. One line per
file/area: what it is, and the one thing to say about it. Start at the rulebook,
end on the frame.

## 1. The system that made every line prove itself

- **CLAUDE.md** — the constitution: ten merge-blocking rules, each with its why,
  plus the operating protocol. Say: "This is law, not guidance; every agent in
  the repo obeys it, and I review at the decision level, not the diff level."
- **SHIPLOG.md** — the live diary, timestamps real, nothing reconstructed. Say:
  "Section 1 is per-rule proof, section 2 is what the AI got wrong and how I
  caught it, section 3 is the rule I'd push back on. Open it here first."
- **scripts/constitution.sh** — the verifier: one command, plain-English
  PASS/FAIL table, evidence written to `shiplog/evidence/`. Say: "This is my
  independent ability to catch problems — static checks plus live-DB checks,
  and it runs in the Auditor, before every deploy, and whenever I want."
- **scripts/gatecheck.ts** — assembles each Change Card's PROOF-OF-DONE section
  and stamps anything unprovable UNPROVEN. Say: "UNPROVEN defaults to reject, so
  a card can't reach me on vibes."
- **scripts/db-query.ts** — the live-DB helper the verifier uses, pinned to the
  Signal Notes project only. Say: "It refuses to run against any other database
  — that pin exists because of a real near-miss (catch #4). [D02]"

## 2. The database: isolation proven, not assumed

- **supabase/migrations/20260901000001_foundation.sql** — the seven foundation
  tables, org-scoped RLS on every one, composite foreign keys. Say: "The
  database itself refuses a child row whose parent belongs to another org —
  policies alone couldn't see through foreign keys. [D01]"
- **supabase/migrations/20260901000002_canvas_schema.sql** — file details,
  briefing sections/citations, margin notes, and the append-only audit trail.
  Say: "Audit lines are pinned to the signed-in user and survive deletion of
  their subject — both were holes the auditor caught before apply. [D07]"
- **scripts/seed.ts** — two realistic orgs (Northwind Advisory, Meridian Group),
  a user each, real documents. Say: "The seed also fixed a hole where a re-run
  could lock the probe out of sign-in forever (catch #7)."
- **scripts/two-org-probe.ts** — the wall-tester: signs in as both seeded users
  and attacks the other org from outside. Say: "24/24 checks — cross-org reads
  return zero, cross-org writes rejected, composite-FK attacks rejected with
  code 23503. It runs in CI, not once by hand. [D01]"

## 3. The generation engine: grounded, traceable AI

- **lib/prompts/briefing.ts** — THE prompt, versioned, alone. Say: "Every word
  the model reads lives here — enforced by R5 *and* the R5b check that was added
  after the auditor found strings hiding in the engine (catch #18). [D05]"
- **lib/ai/anthropic.ts** — the model client and tool loop. Say: "This is where
  the inline prompt strings used to hide; now they're all constants in the
  prompt module, and a flaky 1-in-6 empty-block 400 was hunted down here too
  (catch #19)."
- **lib/ai/generation.ts** — the engine: the model reads only via a
  `read_document` tool bound to the briefing's own org-scoped sources, streams
  the body, and verifies every citation server-side. Say: "The model literally
  cannot open a document outside the set, so the narration is real work, not
  theater [D03] — and a quote that isn't a real substring of its source is
  dropped, never stored [D04]. The server also validates the chosen model
  against a fixed allowlist. [D06]"

## 4. The surfaces: streaming, and reading with citations

- **app/api/briefings/generate/** + **app/api/briefings/[id]/events/** — the
  generate route and the events-replay endpoint. Say: "Every event is persisted
  before it's forwarded, so closing the tab doesn't stop the run — the DB is the
  source of truth, the live stream is best-effort on top."
- **components/generation/generation-surface.tsx** + **lib/use-generation-stream.ts**
  — the live generation screen. Say: "Streaming briefing text is the centerpiece
  with a labeled activity log alongside — plan, read each doc, think, draft. A
  reopened run resumes via events-replay, the exact same code path, so it never
  restarts or duplicates. No bare spinner anywhere (rule 8)."
- **components/compose/composer.tsx** — pick documents, pick the model. Say:
  "The model picker offers only the three allowlisted models; the server
  re-validates. [D06]"
- **components/briefing-view/briefing-view.tsx** + **citation-tooltip.tsx** — the
  reading view. Say: "Every claim carries a citation you hover to see the exact
  source passage and which document it came from — 19/19 verified word-for-word,
  independently re-queried against the DB. Feedback and margin notes store; the
  rating persists across reload (rules 6 and 7). [D04]"
- **components/workspace/workspace.tsx** — the home screen: briefing cards and
  document tiles, search, optimistic list ops. Say: "List mutations update
  optimistically instead of refetching the world — and the one place that
  invites trouble, the un-awaited rating, is the rule I push back on. [D10]"

## 5. The proof it all works, in a real browser

- **e2e/** (Playwright suite) — 42/42 green against the real app and real DB:
  auth wall, all four document states with forced 500s, every file type, a real
  ~56s streaming generation, citations/feedback/audit, cross-org not-found,
  theme both ways, 768px on every surface. Say: "Failures are forced at the
  network layer, so the app ships unmodified — no test-only hooks in product
  code."
- **docs/cards/** (CHANGE-CARD-000…013) — every approved change in plain English
  with its decision, proof, and auditor verdict. Say: "Card 000 is the practice
  run that proved the loop could catch a two-word embellishment before it could
  be trusted to catch a missing RLS policy."
- **docs/catch-log.md** — 19 catches, four parts each, logged at the moment they
  happened. Say: "The strongest four are distilled into SHIPLOG section 2 — a
  live production DB we refused to touch, a cross-org leak wired into the schema,
  a forgeable self-erasing audit trail, and prompts hiding from the checker."
- **docs/decisions/** — the ten distilled decision cards (D01-D10). Say: "These
  are the pushback targets; every one cites a real card and, where there was
  one, a real catch."

## The frame (close on this)

"I didn't hand-type this code and I won't pretend I did. I built the system that
forced every line to prove itself, I reviewed every change at the decision
level, and everything I claim comes with evidence. Ask me anything and I'll show
you the proof."
