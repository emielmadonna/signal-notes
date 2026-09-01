-- Migration 0004 — every document type the uploader can actually read.
--
-- 0002 pinned documents.ext to six labels (PDF/DOCX/TXT/MD/RTF/WEB) because
-- the uploader only knew five extensions. It now reads the whole plain-text
-- family and saved HTML as well (lib/ingest/file-types.ts), so the CHECK has
-- to widen or every one of those uploads dies at the insert with a constraint
-- violation — which the route can only report as a 500.
--
-- The label set here is the EXACT set lib/ingest/file-types.ts can emit, plus
-- WEB (written only by the fetch-url route, which has no file behind it).
-- Adding a format means one row in that table and one label here; nothing
-- else in the app enumerates them.
--
-- Same discipline as 0001-0003: committed BEFORE it is applied (constitution
-- R4), and the live verification query is pasted into the SHIPLOG.

alter table public.documents
  drop constraint documents_ext_check;

alter table public.documents
  add constraint documents_ext_check
  check (ext in (
    -- Rich formats with a real parser behind them.
    'PDF', 'DOCX', 'RTF', 'HTML',
    -- The plain-text family: notes, exports, config, data.
    'TXT', 'MD', 'CSV', 'TSV', 'JSON', 'XML', 'YAML', 'LOG',
    -- Caption/transcript files — the closest thing to a call recording we read.
    'SRT', 'VTT',
    -- Fetched web pages (no file; written by /api/documents/fetch-url).
    'WEB'
  ));

comment on column public.documents.ext is
  'Display type of the source: the label lib/ingest/file-types.ts assigned to the uploaded file, or WEB for a fetched page. Widened from six labels to fifteen in migration 0004.';
