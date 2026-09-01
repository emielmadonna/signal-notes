CHANGE CARD #005
STATUS: APPROVED by Emiel, 2026-09-01 (in session; 1:1 surfaces verified; merged by dispatcher)
WHAT CHANGED: The app now looks like the design you approved. The full token
layer (both themes, exact colors, the three typefaces), every shared primitive
(file icons, pill buttons with working states, skeletons, sheets, toast, the
icon set), and the real shell: header with search, theme toggle, quick menu,
account menu, the canvas-styled sign-in (all its safety logic kept), the
not-found page, and the selection bar. The workspace already talks to the live
database (real org name, real section counts with honest loading/error
states). A headless-browser evidence harness now photographs surfaces and
live-tests flows.
FILES: app/globals.css, app/layout.tsx, app/page.tsx (workspace),
app/signin/*, app/not-found.tsx, app/actions/sign-out.ts, app/design/*
(gallery, deleted in P5), components/theme-provider.tsx, components/ui-sn/*,
components/workspace/*, components/selection-bar.tsx, lib/workspace-data.ts,
e2e/* + playwright.config.ts, middleware.ts (one-line), CLAUDE.md (framework-
generated advisory block, committed to keep the tree clean).
CONSTITUTION RULES TOUCHED: 2 (named columns in the new fetches), 3 (fetch,
org-lookup and sign-out errors all surfaced), 9 (fetches abort on unmount;
error never renders as empty), 10 (working buttons systemized), design
boundary (tokens/components exactly).
THE DECISION: Components carry the canvas's exact inline values through CSS
variables rather than a re-interpretation — fidelity is checkable value by
value. Theme = cookie + localStorage so the server renders the right theme
with no flash. DISPATCHER'S OWN EDIT, claimed here per the auditor: the
verifier gained an R3c warning for comment-only catch blocks (4 present, each
with an audited backstop). REJECTED: utility-class translation of the canvas
(drift risk); cookie-only theme (flash on conflict).
PROOF OF DONE:
  - [PASS] Auditor rejected attempt 1: the serif's optical-size axis was
    silently dropped by the font loader — caught by inspecting the shipped
    font file's axis table (catch #13). Fix verified by both builder and
    auditor: all 14 built font files now carry opsz 7-72.
  - [PASS] tsc, build, constitution (incl. live RLS + 16/16 probe) — run by
    builder, re-run by auditor, evidence constitution-20260901-040502.txt.
  - [PASS] Open-redirect guard re-traced through the restyle; both bypass
    strings still dead.
  - [PASS] Live E2E (4 specs, real browser, real database): sign-in wrong-
    password error renders with form kept; expired variant; workspace shows
    the real org; account menu (no switch row); theme persists across reload;
    auth wall redirects with next; not-found renders; 768px holds.
    Screenshots: shiplog/evidence/p2-visual/ (11 shots, dark + light).
  - [YOUR 30 SECONDS] Look at p2-visual/workspace-dark.png,
    signin-dark.png, gallery-top-dark.png next to the canvas: is this the
    design you approved?
AUDITOR: PASS ×2 (5a on 2nd attempt — catch #13; 5b first look). Advisory
notes accepted: quick-menu click behavior and empty quick menu until P3;
disabled empty-state CTAs until sheets exist; /documents 308 redirect noted as
deliberate; dead pending-button wrapper deleted post-audit (tsc re-verified).
WHAT BREAKS IF THIS IS WRONG: every surface built on top inherits the flaw —
this layer is why "1:1" is checkable at all.
