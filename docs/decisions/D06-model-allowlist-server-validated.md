# D06 — Model allowlist validated server-side

**DECISION.** The composer offers a short, fixed model list (claude-sonnet-5 as
default, claude-opus-5 for depth, claude-haiku-4-5 for speed). The server never
trusts the client's model string: it validates the requested model against the
allowlist and rejects anything else. The chosen model is stored on the briefing
row and shown in the briefing's mono metadata, so every output is traceable to
the model that wrote it.

**ALTERNATIVES REJECTED, AND WHY.**
- *Trust the client-supplied model string.* Rejected — a client could name an
  unapproved, more expensive, or non-existent model; server validation is the
  only place the allowlist can actually be enforced.
- *Don't record which model was used.* Rejected — without the stored model on
  the row, an output cannot be traced back to what produced it.

**EVIDENCE.**
- Cards: CHANGE-CARD-010 (THE DECISION: "the server validates the model against
  the allowed list, never trusts the client string blindly"), CHANGE-CARD-011
  (the picker offers the three allowlisted models).
- Proof: CHANGE-CARD-010 PROOF — "Model allowlist rejects arbitrary strings
  server-side." Model stored on the briefing row and shown in mono metadata.
- Honest limit (SHIPLOG ASSUMED): only claude-sonnet-5 was exercised end-to-end
  live; the opus-5 and haiku-4-5 paths are covered by types + server validation,
  not a live run each. (SHIPLOG section 4 item 4: widen live model coverage.)

**THE LIKELY PUSHBACK / ANSWER.**
"What if someone sends a different model in the request?" — The server rejects
any model not on the fixed allowlist (card 010 proof); the accepted model is
stored on the row and shown in the briefing's metadata.
