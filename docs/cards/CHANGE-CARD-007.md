CHANGE CARD #007
STATUS: PENDING-EMIEL
WHAT CHANGED: The workspace lists are real. Briefings render as paper cards
(date, status, title, source/notes/rating, hover tray of attached documents,
FLIP reflow); documents render as file tiles you can select. Search filters
both. Deleting a briefing works end to end with a confirmation.
FILES: lib/workspace-data.ts (the data layer + optimistic helpers),
components/workspace/briefing-card.tsx, document-tile.tsx, workspace.tsx,
lib/format.ts.
CONSTITUTION RULES: 2 (named columns incl. nested joins), 3 (delete + fetch
errors surfaced), 9 (abort on unmount; error ≠ empty), 10 (optimistic list ops,
working delete button).
THE DECISION: Optimistic list mutations (no refetch-the-world). "Adder" is
omitted from tile meta because auth.users is not client-queryable and no
org-scoped profiles table exists yet — a name would be a forbidden join or an
invention. REJECTED: both.
PROOF OF DONE:
  - [PASS] Live E2E (real browser, real DB): workspace renders seeded docs;
    search filters; screenshots in shiplog/evidence/p3-live/.
  - [PASS] tsc/build/constitution green; nested selects fully named.
AUDITOR: PASS. Card notes (Emiel to weigh): the briefing delete-sheet
consequence line is the canvas's document-shaped copy (honest line would name
notes/ratings/audit); tile shows title vs canvas's file_name; failed-card sub
lacks a <reason> until P4 adds a failure-reason column; profiles seam backlogged.
WHAT BREAKS IF WRONG: the home screen — the first thing anyone sees.
