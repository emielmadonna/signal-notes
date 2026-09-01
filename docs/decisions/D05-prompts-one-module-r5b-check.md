# D05 — All prompts in one module, backed by the R5b check

**DECISION.** Every word the model reads lives in `lib/prompts/` and nowhere
else, versioned (`BRIEFING_PROMPT_VERSION`). When the auditor found that a
grep-based check could not see imperative model-facing strings inlined in the
engine, the decision was not just to move them — it was to add a second
mechanical check (R5b) that hunts second-person/imperative model-directive
strings in `lib/ai` and `app/api`, so the whole class is surfaced by the
machine instead of resting on one reviewer's eye.

HONEST SCOPE (say this before Wren does): R5b is a **WARN**, not a hard FAIL —
it flags every prompt-shaped string in the engine for the auditor to confirm as
"prompt (move it)" vs "protocol token / error string (fine)", rather than
blocking the merge outright. It can't be a blind FAIL because legitimate
non-prompt strings (`"Unknown tool."`, error copy) live there too. So the honest
claim is "the class is now surfaced on every run and must be dispositioned,"
not "the machine auto-blocks it." The hard guarantee is narrower and real: R5
still HARD-FAILs on the fixed prompt-signature phrases, and the KEY checks
hard-fail on any leaked key.

**ALTERNATIVES REJECTED, AND WHY.**
- *Rely on the original R5 grep alone.* Rejected — its heuristic
  (`you are a|system prompt|<instructions`) is structurally blind to short
  imperative strings like "Now call submit_briefing…", so a green R5 was
  misleading while three model-facing strings sat unversioned in the engine.
- *Fix the strings but leave the check as-is.* Rejected — that fixes one
  instance and leaves the class free to recur behind a green check.

**EVIDENCE.**
- Card: CHANGE-CARD-010 (THE DECISION + the note that the verifier gained R5b).
- Catch: #18 (auditor read the engine line by line and found the strings the R5
  grep could not see — `lib/ai/anthropic.ts` lines 261-265, 289, 325; the prompt
  file's own header claimed "NOWHERE ELSE" while R5 showed PASS).
- Proof: strings relocated to named versioned constants in
  `lib/prompts/briefing.ts`; R5 + R5b + KEY checks green in the constitution run.

**THE LIKELY PUSHBACK / ANSWER.**
"Your check passed while prompts were still hidden — so is the check worth
anything?" — Fair, and the honest answer concedes the shape of it: the old R5
grep was blind to short imperatives, so its green was misleading. The fix was
two-part — relocate the strings, AND add R5b so the class is surfaced on every
run for disposition (it's a WARN by design, since non-prompt strings live there
too). I'm not claiming a machine now auto-blocks every possible prompt; I'm
claiming the miss can't hide behind a silent green again, and the human catch
became a standing check. That's the loop working, not the loop being perfect.
