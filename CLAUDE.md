# CLAUDE.md — Signal Notes project constitution

Drop this file at the repo root as `CLAUDE.md` the moment the repo exists. Every
agent working in this repo obeys it. It is law, not guidance.

## Context

Signal Notes: a small multi-tenant app. Org users paste source documents
(interview notes, call transcripts, web copy), select N documents, and generate an
AI briefing grounded in exactly those documents. Two orgs seeded, at least one
user each. Deployed on Vercel, schema managed exclusively via committed Supabase
migration files. Scope is deliberately small: depth beats coverage. The principal
(Emiel) reviews at the decision level via Change Cards; write for him in plain
English, always.

Stack, fixed: Next.js App Router + TypeScript, Tailwind + shadcn/ui, supabase-js
with the SSR helpers, Supabase CLI migrations, Vercel. Everything in English.

## The ten rules (each with its why; violations are merge-blocking)

1. TENANT ISOLATION IS PROVEN, NOT ASSUMED. RLS on every table, org-scoped (not
   merely user-scoped). The committed two-org probe script must pass and its
   output be saved to shiplog/evidence/. Why: cross-tenant leaks are the worst
   class of bug in multi-tenant SaaS; clicking around proves nothing.
2. NEVER `select("*")` and never `select()` with no columns. Name the columns the
   caller actually reads. Why: heavy JSON columns ride along invisibly and break
   typed inference.
3. EVERY write's `{ error }` is checked and surfaced to the UI. No empty catch,
   ever. Why: supabase-js never throws; an unchecked write is silent data loss.
4. MIGRATIONS: the SQL file is committed before it is applied, and "done" means
   the live verification query result (information_schema.columns + the
   migrations tracking row) is pasted into the SHIPLOG. Why: a migration that
   looked done in git but never ran is the most painful failure mode there is.
5. AI PROMPTS live in `lib/prompts/` only. Never inline strings in handlers.
   Why: prompts are an operations surface; they get reviewed and versioned.
6. AI OUTPUT SHOWS ITS GROUNDING: the briefing displays which source documents
   fed it. Why: glass box; users trust what they can trace.
7. EVERY generator ships a FEEDBACK SEAM: rate + annotate, stored in the
   database. Why: a generator with no feedback loop is unfinished.
8. AI WORK NARRATES ITSELF: human-readable status while generating, never a bare
   spinner. Why: working with AI should feel like a colleague saying what
   they're doing.
9. CLIENT FETCHES abort on unmount; a non-2xx NEVER renders as empty success.
   Why: stale-response races, and 500s disguised as "no data yet", are real bug
   classes.
10. MUTATION BUTTONS have loading states; update local state optimistically
    instead of refetching the world. Why: felt quality.

## Operating protocol (how work moves)

- Work travels DISPATCHER -> BUILDER -> AUDITOR -> CHANGE CARD -> EMIEL -> merge.
  Nothing merges without an approved Change Card. Card format: docs/cards/.
- PROOF-OF-DONE is mandatory on every task: pasted command output, live query
  result, or screenshot. "It should work" and "done" without evidence are
  automatic rejections. Never claim a result you did not observe.
- STREAM: every agent appends one plain-English line per action to
  docs/stream.md (`HH:MM:SS | role | what I'm doing and why, present tense`).
  No jargon; the principal is not a coder and reads this live.
- CATCH LOG: any rejected claim, wrong output, or would-have-broken mistake gets
  a four-part entry in docs/catch-log.md at the moment it happens: CLAIM /
  VICTIM / THE CATCH (with evidence) / FIX + SYSTEM CHANGE.
- VERIFIER: `npm run constitution` must pass before any merge and before any
  deploy. `npm run gatecheck` assembles each Change Card's proof section;
  UNPROVEN lines default to reject.
- SHIPLOG.md at repo root is a live diary, never reconstructed. Evidence files
  go in shiplog/evidence/ with stable names referenced from SHIPLOG.

## Hard boundaries

- No schema changes through the Supabase dashboard. Migration files only.
- The service-role key never appears in client code or any NEXT_PUBLIC_ env var.
- Never weaken a failing test to make it pass; fix the code or escalate.
- Never mark a task complete with failing checks; escalate to the dispatcher.
- Seed data ships as a committed script: two orgs, one user each, realistic
  documents.
- UI implements the approved design system tokens/components exactly; no
  improvised styling. All UI states (empty/loading/error/working) are part of
  "done", not polish.

## Repo layout

app/ (routes + API), components/, lib/prompts/ (ALL prompts), lib/supabase/,
supabase/migrations/, scripts/ (probe, verifier, gatecheck, seed), docs/
(stream.md, catch-log.md, cards/), shiplog/evidence/, SHIPLOG.md, CLAUDE.md.

## Definition of done, per task

1. Code written to the rules above. 2. Proof-of-done attached. 3. Verifier
passes. 4. Auditor pass. 5. Change Card approved by Emiel. 6. Stream updated.
Only then: merge.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
