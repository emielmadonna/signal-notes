CHANGE CARD #010
STATUS: PENDING-EMIEL
WHAT CHANGED: The briefing engine. On the server, the AI reads only the
documents you selected, narrates its work as it goes (planning, reading each
document, thinking, drafting), streams the briefing as it writes it, and
attaches citations that quote the exact source passage. Every step is saved as
it happens, so closing the tab doesn't stop the run.
FILES: lib/prompts/briefing.ts (THE prompt, versioned), lib/ai/anthropic.ts,
lib/ai/generation.ts, lib/briefing-types.ts, app/api/briefings/generate/,
app/api/briefings/[id]/events/.
CONSTITUTION RULES: 5 (all prompts in lib/prompts — enforced by a new R5b
check), 6 (grounding: every citation server-verified against its source), 8
(narration is real tool calls, not theater), plus the key/RLS boundaries.
THE DECISION: The model reads via a read_document tool constrained to the
briefing's own bound, org-scoped sources — it literally cannot open anything
else. Citations are verified server-side (each quote must be a real substring
of its named document); unverified ones are dropped and don't count. The
database is the source of truth; the live stream is best-effort on top.
REJECTED: dumping doc bodies into the prompt (would make narration decorative);
trusting the model's quotes (tooltips must be real).
PROOF OF DONE:
  - [PASS] Real end-to-end run as seeded Ana, default claude-sonnet-5, her real
    docs: 810 words, 7 sections, 19/19 citations verified word-for-word — the
    dispatcher independently re-queried the DB and confirmed all 19 quotes are
    genuinely present in their named source docs, across 3 docs.
  - [PASS] Event stream is real & ordered: plan → think → read each doc (labeled
    tool calls) → themes → 20 text_delta chunks; audit RUN STARTED…COMPLETE.
  - [PASS] Model allowlist rejects arbitrary strings server-side; read_document
    containment + org-scoping proven; failure path keeps a failed row + partial.
  - [PASS] R5 + R5b + KEY checks green; @anthropic-ai/sdk usage checked vs the
    claude-api skill.
AUDITOR: PASS (2nd attempt). 1st REJECT: three prompt strings inlined in the
engine (catch #18) — relocated, and the verifier gained R5b to catch the class.
Also fixed in review: a flaky 1-in-6 empty-text-block 400 (catch #19), 7 clean
runs after.
WHAT BREAKS IF THIS IS WRONG: the product's whole promise — grounded, traceable
AI. If a citation could be fabricated, the glass box is a mirror.
