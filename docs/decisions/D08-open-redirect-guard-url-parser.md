# D08 — Open-redirect guard via the browser's own URL parser

**DECISION.** The sign-in `?next=` return destination is resolved through the
browser's own URL parser and accepted only if it stays on our origin. The
simpler "must start with `/`" string check was rejected after the auditor proved
it could be steered to an attacker's site. The two working bypass strings became
permanent gatecheck test cases so the hole cannot silently reopen.

**ALTERNATIVES REJECTED, AND WHY.**
- *String-prefix check ("starts with `/` and not `//`").* Rejected — browsers
  treat a backslash as a slash in URLs, so `/\evil.com` passes the guard yet
  navigates to evil.com; tab/newline tricks do the same. A crafted sign-in link
  would hand a fresh session to an attacker's page dressed as Signal Notes.
- *Per-form ad-hoc busy states* (related card-003 decision) — rejected in favor
  of one shared pending-aware button so no future form can forget rule 10.

**EVIDENCE.**
- Card: CHANGE-CARD-003 (THE DECISION).
- Catch: #8 (auditor constructed the bypass — `signin-form.ts` lines 11-18 plus
  the two working bypass strings). Related catch #9 (sign-out had no working
  state) drove the shared pending button.
- Proof: both bypass strings traced dead by the auditor, re-traced through the
  P2 restyle and still dead (CHANGE-CARD-005 proof); the two strings are
  permanent gatecheck cases.

**THE LIKELY PUSHBACK / ANSWER.**
"Isn't checking the path starts with `/` enough?" — No; `/\evil.com` passes that
check but a browser navigates off-site. We resolve against our origin instead,
and both bypass strings are permanent gatecheck cases proving it's closed.
