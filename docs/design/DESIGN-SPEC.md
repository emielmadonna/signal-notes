# DESIGN-SPEC — Signal Notes (from the approved canvas, 2026-09-01)

Source of truth: docs/design/canvas/Signal Notes.dc.html (approved by Emiel,
https://claude.ai/design/p/f4668abe-302a-4320-b8ef-da5c54855dbc). This file is
the distillation the builders implement from; when in doubt, the canvas wins.

## 1. Tokens

Fonts (Google Fonts): Literata (serif — briefing/doc bodies, titles, wordmark),
Space Grotesk (sans — UI chrome, weights 400/500/600), IBM Plex Mono (mono —
micro labels, timestamps, counts, log lines, tags).

Two themes; DARK IS DEFAULT, toggle in header, persisted.

| token      | dark      | light     | used for |
|------------|-----------|-----------|----------|
| bg         | #0F0F0E   | #EAE6DC   | app background |
| head       | #141413   | #FBFAF6   | header bar |
| border     | #2C2B27   | #D9D3C6   | hairlines, ghost buttons |
| soft       | #26251F   | #E7E1D3   | subtle dividers, disabled bg |
| text       | #EFECE4   | #1B1A17   | primary ink |
| muted      | #8B877D   | #6E6759   | secondary text |
| faint      | #6B675F   | #8C8578   | micro/faint text |
| sheet      | #1A1A18   | #FBFAF6   | modals, menus, pills |
| card       | #1F1E1A   | #FDFAF0   | briefing paper cards |
| cardRule   | rgba(126,158,180,.22) | #D3E1EA | ruled lines on cards |
| cardMargin | #8A4A42   | #E39089   | red margin rule (left, 1px, x=34px) |
| cardText   | #EFECE4   | #1B1A17   | text on cards |
| cardMuted  | #9A9184   | #8C8578   | secondary on cards |
| accent     | #FFCC48   | #E8B32A   | primary actions, selection, citations |
| onAccent   | #1A1707   | #231C05   | text on accent |
| danger     | #E5836F   | #B6543F   | errors, failed, delete |
| hoverBg    | #211F1C   | #F1EDE1   | hovered rows |
| tip        | #111110   | #FDFAF0   | citation tooltip bg |

File-type colors (icon borders/labels): PDF #E5836F · DOCX #7FA6D9 ·
TXT #A9A499 · MD #8FBF87 · RTF #B08CD9 · WEB #E8B32A.
Log tag colors: TOOL #7FA6D9 · THINK #B08CD9 · DONE #8FBF87 · PLAN/WRITE accent
· ERROR danger.

Shape: pill buttons (radius 100px), cards/sheets radius 12-16px, file icons
radius 4-8px with folded corner. Buttons: primary = accent bg, 600 12.5px Space
Grotesk, h34 (h31 small); ghost = 1px border transparent bg; danger = danger
border/text; link = underlined muted text. Micro labels: mono 9px letterspacing
.12-.16em uppercase.

Motion: sn-rise (fade+10px up), sn-fade, sn-line (fade+4px), sn-blink (caret),
sn-shim/sn-sweep (skeleton shimmer), sn-pulse (live tag). Hover cards lift -2px
with deep shadow; FLIP animation when bento cards reflow; trays/menus expand
with cubic-bezier(.32,.72,0,1).

## 2. Layout

One authenticated screen (the workspace) + sign-in. Desktop 1440, holds to
768px, min-width 360. Header h62: mark + wordmark · search (pill, 180-320px) ·
theme toggle · "New briefing" (primary, hover opens QUICK MENU: 4 recent docs
with selection toggles, count, Generate briefing, All documents) · account
button (avatar initials, name, org in mono; menu: SIGNED IN AS email,
WORKSPACE list with active org check + inert "Switch account…" row, Sign out).

Main scroll: BRIEFINGS section (h2 serif + mono sub "4 · ONE RUNNING") then
DOCUMENTS section (mono sub "5 FILES", right-aligned "DRAG FILES ANYWHERE
HERE"). Floating SELECTION BAR bottom-center pill when ≥1 doc selected:
stacked file icons, "N documents selected", Generate briefing, Open, Rename,
Delete (danger), Clear (link).

## 3. Components and behaviors

BRIEFING CARD (paper): ruled background lines every 22px, red margin rule at
34px, content padded left 48px. Rows: mono date + status stamp (GENERATING
accent / FAILED danger / COMPLETE muted, outlined pill) · serif 19px title ·
sub-line (complete: sans muted excerpt; generating: mono accent live step e.g.
"Extracting themes from ridgeline-vpops.docx · step 3 of 8"; failed: danger
"Didn't finish — <reason>. Try again.") · footer "N SOURCES · N NOTES ·
RATING". Hover: lift, delete button fades in top-right, ATTACHED DOCUMENTS
tray expands below (file rows open the document sheet); other cards FLIP.
Click: generating → live generation sheet; complete → briefing sheet; failed →
generation sheet showing the failure.

DOCUMENT TILE: file icon (52px, ext label, folded corner, two rule lines,
type color), selection check badge (accent dot, scales in), name, mono meta
"312 KB · 12 AUG · M. ELLISON", hover reveals mono OPEN. Click toggles
selection; Open opens the sheet. Tiles sit in a drag-drop zone: dragging shows
dashed accent outline + overlay "Drop to add to <org>" + allowed types; drop
uploads and shows a toast "<file> added". Add tile: dashed, plus circle.

STATES (both sections, four each): populated · empty (briefings: "No briefings
yet." + explainer + CTA; documents: big drop target "Drop your first document
here") · loading (briefing card skeletons with margin rule + accent sweep; doc
tile skeletons with shimmer) · error (danger-bordered box, 2px danger rule,
"We couldn't load your briefings." / "The connection dropped. Nothing has been
lost." + Try again). Error ≠ empty ≠ loading, always.

SHEETS (scrim rgba(6,6,5,.72/.45), sheet rises .24s; widths: brief 1080 / doc
960 / compose+paste+gen 740 / delete+notfound 460):
- DOCUMENT: big file icon, filename, serif title (inline edit: accent
  underline input; Edit→Save→"Saving…"→SAVED mono accent), mono meta "KIND ·
  SIZE · ADDED <meta>", body serif 15px lh1.8 max 66ch (edit mode: accent
  border box), actions Use in briefing (primary sm) + close. Right rail 230px:
  USED IN N BRIEFINGS (serif rows with mono meta, clickable), FILE HISTORY
  (mono rows: uploaded, title edited, read by briefing NNN).
- ADD DOCUMENT: drop zone with 6 type icons, "Drop a file here, or browse",
  "PDF · DOCX · TXT · MD · RTF · WEB URL · UP TO 20 MB"; TITLE field
  (missing-title state: danger underline + inline guidance "A title is how
  you'll find this later…"); KIND segmented pills (Interview notes / Call
  transcript / Web copy / Other); TEXT paste box with mono char count; Save
  document (primary, "Saving…").
- COMPOSER: "New briefing" + "Pick the documents it may read. It will read
  nothing else." · optional title (serif underline field) · doc pick tiles
  (same selection language) · Generate briefing (disabled at zero w/ soft bg +
  "Select at least one document — a briefing with no sources would just be a
  guess.") · MODEL PICKER (see §5 deviation D1) · zero-docs edge: "Nothing to
  ground a briefing in yet." + Add a document.
- GENERATION (signature): top progress bar (accent, width = steps done/total;
  danger full on fail), serif title, mono "N OF M STEPS · X.XS ELAPSED",
  status chip GENERATING/COMPLETE/FAILED, source chips. Timeline: mono
  timestamp + outlined TAG pill (PLAN/TOOL/THINK/WRITE/DONE, colored; current
  pulses) + text (TOOL lines in mono, e.g. "read_document(acme.pdf) → 62
  passages"). While writing: LIVE OUTPUT box — "DRAFTING · LIVE OUTPUT" micro
  label + serif body streaming in with blinking accent caret ▍. Failure: log
  halts, last line becomes ERROR/danger, block "This briefing didn't finish."
  / "Nothing was saved and your documents are untouched." + Try again + Back
  to composer; partial log AND partial text stay. Footer: "You can close this
  — the run keeps going." + Read the briefing (when done).
- BRIEFING (reading): paper card, red margin at ~52px, "BRIEFING NNN ·
  COMPLETE" micro, serif 33px title, mono meta "DATE · AUTHOR · N SOURCES · N
  CITATIONS", Audit trail toggle + close. GROUNDED IN chip row (file chips
  open doc sheet). Body max 66ch: serif lede 19px, sections = uppercase sans
  10.5px head + serif 16px paras with CITATION superscripts (accent, dotted
  underline, cursor help) → hover TOOLTIP: file icon + mono "PASSAGE 14 OF
  62" + serif quote + filename (fixed-positioned, flips below near top).
  Margin NOTE button per section on hover → textarea "Comment on this
  section…" + Comment ("Saving…")/Cancel; saved notes render as accent-left-
  bordered cards with "MARA ELLISON · time" + Delete. Right rail 212px: YOUR
  JUDGMENT (Useful pill w/ thumb + working "Saving…"; thumb-down round;
  rated line "YOU RATED THIS USEFUL · EDIT" persists), NOTES list (section
  name + text; empty: "Hover a section and use the margin mark to comment."),
  GENERATION LOG (mono lines, full replay). AUDIT TRAIL (toggled): "APPEND-
  ONLY · N EVENTS · ORG-SCOPED", table TIME/EVENT/DETAIL/ACTOR (RUN STARTED,
  SOURCE BOUND, TOOL CALL, CHECK, COMPLETE, RATED, VIEWED, EXPORTED, NOTE);
  human actors accent, SYSTEM muted.
- DELETE: "Delete this briefing? / this document? / N documents?", names, the
  honest consequence line, Delete (danger, "Deleting…") + Cancel.
- NOT FOUND: "This page doesn't exist." + "It may have been deleted, or the
  link may be wrong." + Back to briefings.

SIGN-IN (full screen over bg): mark + serif 24px wordmark, italic serif lede
"Briefings grounded in your own documents.", optional expired box ("You were
signed out." / "Sign in to continue where you left off."), EMAIL + PASSWORD
underline fields, error state (danger rule + "That email and password don't
match." / "Check the password and try again.", password underline danger),
full-width accent Sign in with "Signing in…".

SEARCH filters both sections live; subs become "N OF 5 FILES" / "N MATCHING".

## 4. Data the design implies (drives migration 0002)

- documents: + file_name, ext (PDF|DOCX|TXT|MD|RTF|WEB), size_bytes; body =
  extracted text. Upload pipeline parses PDF/DOCX/RTF/TXT/MD and fetches WEB
  URLs (20 MB cap).
- briefings: delete allowed (org-scoped policy needed); sections stored
  structured (head, paragraphs, citation refs) + citations (document_id,
  passage label, exact quote) so tooltips are real; word/citation counts.
- briefing_notes (new): org-scoped, per-briefing, per-section, author + text.
- audit_events (new): append-only, org-scoped, briefing- or document-scoped,
  event/detail/actor; feeds AUDIT TRAIL and FILE HISTORY.
- generation_events: kinds map PLAN/WRITE/DONE→status, TOOL→tool_call,
  THINK→thinking, stream→text_delta (existing schema fits; tag rendered from
  kind + content).

## 5. Deviations from the canvas (each deliberate, Emiel may veto)

- D1 MODEL PICKER: not in the canvas, but Emiel explicitly required model
  selection (2026-09-01). Added to the composer in the canvas's own language:
  micro label MODEL + segmented pills like KIND (Sonnet — balanced default /
  Opus — deepest / Haiku — fastest); chosen model joins the briefing sheet's
  mono meta line.
- D2 DEMO CONTROLS EXCLUDED: the state tabs (Populated/Empty/…), "Simulate
  failure", and sign-in "SESSION EXPIRED"/"ERROR STATE" tiny links are canvas
  demo affordances, not product. Real states are driven by real data. Failure
  forcing for tests/gatecheck happens via a dev-only server hook instead.
- D3 "Switch account…" row: kept visually (muted, inert) — users belong to
  exactly one org; there is no switcher to build.
- D4 EXPORTED audit event: canvas shows "EXPORTED PDF" — no export feature is
  in scope; the event type exists but nothing emits it (ASSUMED list).
- D5 Canvas mock content (Mara Ellison, Acme docs) is placeholder; real data
  comes from the seeded orgs. Avatar initials derive from the signed-in user.
