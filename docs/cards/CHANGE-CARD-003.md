CHANGE CARD #003
STATUS: PENDING-EMIEL
WHAT CHANGED: Signing in and out works, and the app is locked: every page
except sign-in redirects strangers to sign-in (and returns them to where they
were headed afterwards). A quiet "This page doesn't exist" stands where
cross-organization URL probing lands. The documents page is a placeholder
until the real list arrives in P3.
FILES: app/signin/ (page + form), app/documents/page.tsx (placeholder +
sign-out), app/not-found.tsx, components/pending-button.tsx, middleware.ts.
CONSTITUTION RULES TOUCHED: 3 (sign-in and sign-out errors surfaced inline,
human wording, form stays filled), 10 (both buttons show working states).
THE DECISION: The return-to destination is resolved through the browser's own
URL parser and accepted only if it stays on our site — after the auditor
proved the simpler "starts with /" check could be steered to an attacker's
site with a backslash. The working-state button is a shared component so no
future form can forget rule 10.
REJECTED: string-prefix checks for the redirect (bypassable); per-form ad-hoc
busy states.
PROOF OF DONE:
  - [PASS] tsc + build re-run by auditor; routes /signin /documents /_not-found
  - [PASS] Both redirect bypass strings traced dead by auditor
  - [PASS] No key references in app/ or middleware (audited grep)
  - [UNPROVEN] Live click-through of sign-in/sign-out — seeded users now exist,
    so this is provable; queued as the first P2/P3 gatecheck item.
AUDITOR: PASS (2nd attempt). 1st attempt REJECTED: open-redirect bypass via
backslash/tab (catch #8) and sign-out button with no working state (catch #9).
WHAT BREAKS IF THIS IS WRONG: a crafted sign-in link hands a fresh session to
an attacker's page; double-fired sign-outs; strangers browsing protected pages.
