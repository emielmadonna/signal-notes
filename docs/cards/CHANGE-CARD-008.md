CHANGE CARD #008
STATUS: APPROVED by Emiel, 2026-09-01 (in session; 1:1 surfaces verified; merged by dispatcher)
WHAT CHANGED: You can add documents every way the design promises — paste text,
drop or browse a file (PDF, DOCX, TXT, MD, RTF), or fetch a web page by URL.
Each becomes a real document with its text extracted; every failure says so in
human words.
FILES: app/documents/new/, components/add-document/*,
components/workspace/drop-zone.tsx, app/api/documents/upload/route.ts,
app/api/documents/fetch-url/route.ts.
CONSTITUTION RULES: 2, 3 (every insert + every API failure surfaced, non-2xx
never a fake success), 9 (sheet fetches abort on unmount), 10 (Save/Fetch
working states).
THE DECISION: File parsing runs server-side (pdf-parse/mammoth + a transparent
RTF stripper) so the browser never sees a heavy parser or the service key.
Web-page fetching is guarded against private-network addresses (SSRF, catch
#16). REJECTED: client-side parsing; unguarded fetch.
PROOF OF DONE:
  - [PASS] Auditor independently reproduced: unauth → 401 JSON; signed-in PDF
    upload → 200 with the PDF's real text stored; worker bundling honest.
  - [PASS] SSRF host guard verified across 16 host cases.
  - [PASS] tsc/build/constitution green.
AUDITOR: PASS. Card notes: PDF bodies keep pdf-parse page markers (strip before
P4 quotes them); two DropZone overlay bg literals approximate the canvas rather
than match; test-upload audit rows persist append-only (service-role sweep
backlogged); live per-type upload evidence to be captured in the P5 sweep.
WHAT BREAKS IF WRONG: garbage-in — a briefing is only as good as the text here.
