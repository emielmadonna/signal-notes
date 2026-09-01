# MASTER-PLAN — Signal Notes, prep to submission

The complete agent plan. The Dispatcher executes this phase by phase; you approve
Change Cards between steps. Budget shown per phase; total build clock ~13h against
the 12-15h box, with prep untimed (before "go") and rehearsal partly off-clock.

## The file structure (created in P0, everything lives here)

```
signal-notes/
  CLAUDE.md                    <- the constitution (from CONSTITUTION-CLAUDE.md)
  SHIPLOG.md                   <- live diary (from SHIPLOG-TEMPLATE.md)
  MASTER-PLAN.md               <- this file
  AGENT-PROMPTS.md             <- dispatcher/builder/auditor/mock-wren/analyst
  app/                         <- routes + API handlers
  components/                  <- design system + feature components
  lib/prompts/                 <- ALL AI prompts (rule 5)
  lib/supabase/                <- server/browser clients
  supabase/migrations/         <- committed SQL, the only schema channel
  scripts/
    constitution.sh            <- verifier (skeleton exists pre-go)
    gatecheck.ts               <- assembles Change Card proof sections
    two-org-probe.ts           <- rule 1 proof, committed and CI-run
    seed.ts                    <- 2 orgs, users, realistic documents
  docs/
    stream.md                  <- live agent narration (your window)
    catch-log.md               <- every catch, at the moment it happens
    cards/                     <- CHANGE-CARD-001.md ...
    decisions/                 <- distilled decision cards for Part D
    design/DESIGN-SPEC.md      <- tokens + components from Claude Design
  shiplog/evidence/            <- every proof file SHIPLOG references
  deliverables/
    PART-B.md                  <- ranked findings review
    PART-C.md                  <- incident write-up
    TOUR.md                    <- Part D tour script
```

---

## P0 — PREP (before "go"; untimed; finish everything here first)

Owner: you + one Claude Code session (acting as Dispatcher-to-be).

- P0.1 Create the repo (private GitHub) with the tree above; drop in CLAUDE.md,
  SHIPLOG.md (from template), AGENT-PROMPTS.md, MASTER-PLAN.md, constitution.sh,
  empty stream/catch-log/cards. NO application code, NO schema. Artifact: repo
  at commit "harness".
- P0.2 Accounts ready: Supabase project created (blank), Vercel account linked
  to the repo, envs noted locally (never committed). Artifact: URLs + env
  checklist in a private note, not the repo.
- P0.3 DESIGN (you, in parallel, already running): run the DESIGN-PROMPTS.md
  master prompt in Claude Design; iterate to the acceptance bar; export the
  token/component inventory as docs/design/DESIGN-SPEC.md plus screen exports.
  Artifact: DESIGN-SPEC.md. This gates P2, not P1. NOTE (2026-09-01): the
  design prompt's composer surface now needs a quiet model picker, and the
  generation surface now needs the briefing body streaming in live as the
  centerpiece with the labeled activity log (status / thinking / tool calls)
  alongside — DESIGN-PROMPTS.md has been amended; re-run or patch the design
  accordingly before approving the spec.
- P0.4 Mission Control (OPTIONAL, hard 2h cap): tiny local page rendering
  stream.md + pending cards + catch counter. Kill at 2h; tailing stream.md is
  the fallback.
- P0.5 Dry run: boot the Dispatcher with its prompt; it reads CLAUDE.md, writes
  its first stream line, spawns a Builder on a toy task ("create README title"),
  Auditor rejects/passes, a practice Change Card reaches you. You approve it.
  Artifact: CHANGE-CARD-000 (practice), proving the loop works before the clock.
- P0.6 LLM provider ready: API key created (Anthropic recommended), billing
  enabled, a rough cost cap decided, key stored for local + Vercel server env
  ONLY (never NEXT_PUBLIC_, never committed). Pick the DEFAULT generation model
  now (claude-sonnet-5) so P4 doesn't stall — and fix the short list the in-app
  model selector offers (claude-sonnet-5 default; claude-opus-5 for depth;
  claude-haiku-4-5 for speed), since the UI ships model selection (see P4).
- P0.7 scripts/gatecheck.ts built alongside constitution.sh (it is harness, so
  pre-go legal): runs the verifier, executes the per-rule probes for a given
  card, captures screenshots via headless browser, and emits the card's PROOF
  OF DONE section with UNPROVEN stamps.
- EXIT GATE: repo pushed, accounts live, LLM key set, gatecheck working, design
  spec approved by you, loop dry-run passed. THEN you reply "go" to Wren. Not
  before.

## P1 — FOUNDATION (~2.5h): Supabase + Vercel end to end

Owner: Dispatcher + Builder-1 + Auditor. You: approve ~4 cards.

- Scaffold Next.js App Router + TS + Tailwind/shadcn; wire lib/supabase clients.
- Migration 0001: organizations, org_members (user->org), documents, briefings,
  briefing_sources, briefing_feedback, generation_events. Org-scoped RLS
  policies on EVERY table including children. Committed before applied,
  verified after (R4 evidence pasted to SHIPLOG). Streaming-ready columns from
  day one so no later migration is needed: briefings.model (the model that
  generated it) and generation_events.kind
  (status | thinking | tool_call | text_delta).
- scripts/seed.ts: 2 orgs ("Northwind Advisory", "Meridian Group"), 1+ user
  each, 6-8 realistic documents each.
- scripts/two-org-probe.ts working; first R1 evidence saved.
- Auth: sign-in page per design (P2 tokens may still be pending; use neutral
  shell, restyle in P2), protected routes, not-found page for cross-org URLs.
- Deploy to Vercel (envs set there); CI: constitution.sh + tsc on every push.
- Artifacts out: migration 0001, seed, probe output, deployed URL, CI green
  run, cards 1-4, SHIPLOG R1+R4 entries, stream + catch entries as they happen.

## P2 — DESIGN SYSTEM IN CODE (~1.5h)

Gated on DESIGN-SPEC.md. Owner: Builder-2.

- Tokens (palette, type scale: serif/sans/mono, spacing, radii) into Tailwind
  config; shell (nav, org name, sign-out); shared components: InlineError,
  StateBlock (empty/loading/error), working-state Button, ActivityLog,
  GroundingPanel, FeedbackSeam, DocumentPickerRow.
- Artifact: components + a side-by-side screenshot set (design vs built) in
  evidence; card 5. Your review here is visual: does it match what you approved.

## P3 — DOCUMENTS CRUD (~2h): rules 2, 3, 9, 10 territory

- List (4 states), add/paste, detail with title AND body edit, delete with
  confirm. Named columns everywhere; every write's error surfaced through
  InlineError; fetches abort on unmount; non-2xx renders the error state;
  optimistic updates with working buttons.
- Artifacts: cards 6-8, forced-500 screenshots (R3/R9), edit recording (R10),
  probe re-run after new tables/policies touched.

## P4 — BRIEFINGS (~3.5h): rules 5, 6, 7, 8 territory. The product's heart.

- lib/prompts/briefing.ts: the generation prompt, versioned, alone (R5).
- Generation route: selects docs (named columns), calls Anthropic with
  streaming ON, and relays every event kind as it arrives — plain-English
  status lines, the model's THINKING (rendered distinctly, quiet mono),
  TOOL CALLS labeled in human terms ("Reading document 'Acme call, Aug 12'",
  never raw JSON), and the briefing body itself as live text streaming
  token-by-token into the view. All persisted as generation_events rows
  (kind: status | thinking | tool_call | text_delta) so the log replays
  faithfully. Writes briefing + briefing_sources (R6's data). Failure path
  stores status=failed with the partial log AND the partial body.
- MODEL SELECTION: the composer carries a quiet model picker (from the P0.6
  short list, default claude-sonnet-5). The chosen model is stored on the
  briefing row and shown in the briefing's mono metadata, so every output is
  traceable to the model that wrote it. The server validates the model against
  the allowed list (never trusts the client string blindly).
- UI: composer (selection, zero-docs edge, model picker), live generation
  screen: streaming briefing text as the centerpiece with the labeled activity
  log (status/thinking/tool calls) alongside — rule 8 satisfied by BOTH, no
  bare spinner anywhere. Briefing view (grounding panel, feedback seam wired
  to briefing_feedback, log replay incl. thinking + tool calls), history with
  generating/failed rows.
- Artifacts: cards 9-12, mid-stream screenshot (partial body + live log),
  failure screenshots, feedback row query output (R7), SHIPLOG R5-R8 entries.

## P5 — HARDENING + SHIPLOG (~2h)

- Full gatecheck sweep across every surface: forced failures, resize to 768px,
  abort checks, final constitution run with DATABASE_URL live.
- Distill catch-log into SHIPLOG section 2 (strongest 3-4, raw log stays
  committed). Write section 3 (your pushback rule: pick the one YOU actually
  disagree with; the analyst can stress-test your argument, not write it) and
  section 4 (next week). Fill the ASSUMED list honestly.
- Artifacts: final SHIPLOG, full evidence dir, green CI on main, deployed URL
  re-verified.

## P6 — PARTS B + C (~3h, written; you own these with the Analyst)

- Part B: Analyst produces ranked findings with SHOW-ME blocks; you interrogate
  every finding until you can retell its failure story cold; you pick and argue
  the top-3. Artifact: deliverables/PART-B.md.
- Part C: Analyst drafts; the structural answer is the ghost-migration gate
  ALREADY RUNNING in this repo's CI, cited by filename. You edit until every
  sentence is one you can defend. Artifact: deliverables/PART-C.md.

## P7 — PART D ARMOR (~1.5h + rehearsal time off-clock)

- Distill docs/cards/ into docs/decisions/ (6-10 decision cards) and TOUR.md.
- Mock-Wren round 1 (mid-week, after P4) and round 2 (day before walkthrough).
  Every fumble becomes a card fix or a rehearsed answer.
- Walkthrough tech check: deployed URL smoke-tested 30 minutes before; demo
  logins for BOTH orgs ready in two browser profiles so tenant isolation can be
  demoed live (org B not seeing org A's new document is the best 20 seconds of
  the hour); screen share rehearsed once.
- Artifacts: decisions/, TOUR.md, two mock scorecards, demo checklist.

## SUBMIT + ROUND 2

- Submit by day 5: repo, deployed URL, SHIPLOG, PART-B, PART-C. Days 6-7 held
  clean for the 48h review response.
- Round 2 protocol when comments land: triage each comment FIX or PUSHBACK
  within 2 hours of receipt; every FIX flows through the normal pipeline (card +
  proof, referenced in your written response); every PUSHBACK gets evidence, not
  effort, as its argument. Artifact: a written response document mapping every
  comment to its fix-commit or its counter-argument. The delta is the top-graded
  signal of the whole exercise; this is where flying colors actually happens.

## Artifact ledger (what exists when you're done)

Repo + deployed URL; CLAUDE.md; SHIPLOG.md with evidence/ (probe outputs,
information_schema pastes, forced-failure screenshots, recordings); docs/stream.md
(the whole build narrated); docs/catch-log.md (raw) -> SHIPLOG section 2
(distilled); docs/cards/ (every approved change) -> docs/decisions/ + TOUR.md
(Part D); DESIGN-SPEC.md; PART-B.md; PART-C.md; two mock-Wren scorecards; round-2
response doc. Every one of these is either graded directly or is ammunition for
something that is.
