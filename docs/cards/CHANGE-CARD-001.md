CHANGE CARD #001
STATUS: PENDING-EMIEL
WHAT CHANGED: The app now exists as a runnable skeleton: the web framework,
the styling system, and the two database connectors (one for the server, one
for the browser) that every later screen uses. No visible product yet.
FILES: app/ (layout, starter page), package.json, tsconfig, Tailwind/shadcn
config, lib/supabase/server.ts, lib/supabase/client.ts, middleware.ts (session
refresh), .gitignore (merged).
CONSTITUTION RULES TOUCHED: hard boundaries (only the publishable key in app
code; service key nowhere), R2 groundwork.
THE DECISION: Scaffolded in a temp dir then merged in, keeping our README,
rulebook and diary over the boilerplate. The scaffold's .env* ignore line was
deliberately NOT merged — it would have silently hidden .env.example from git.
REJECTED: scaffolding in place (tool refuses non-empty dirs); one-file client.
PROOF OF DONE:
  - [PASS] npx tsc --noEmit exit 0 (auditor re-ran)
  - [PASS] npm run build exit 0, 4 routes (auditor re-ran)
  - [PASS] verifier: no key references in app code (KEY checks green)
  - [PASS] .env.example tracked, .env.local ignored (git check-ignore, audited)
AUDITOR: PASS (1st attempt). Accepted with notes: the commented catch in
server.ts is the official framework pattern, backstopped by middleware (not a
rule-3 breach); layout still says "Create Next App" — P2 owns the shell;
middleware.ts rename to proxy.ts deferred (framework deprecation notice).
WHAT BREAKS IF THIS IS WRONG: every later screen — the clients are the only
door to the database, and a leak here would be a leak everywhere.
