# D05 — All prompts in one module, backed by the R5b check

**DECISION.** Every word the model reads lives in `lib/prompts/` and nowhere
else, versioned (`BRIEFING_PROMPT_VERSION`). When the auditor found that a
grep-based check could not see imperative model-facing strings inlined in the
engine, the decision was not just to move them — it was to add a second
mechanical check (R5b) that hunts second-person/imperative model-directive
strings in `lib/ai` and `app/api`, so the whole class is caught by the machine,
not just by eye.

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
anything?" — Exactly why R5b exists: the miss became a new mechanical check that
catches the whole class of imperative strings in the engine, proven green after.
