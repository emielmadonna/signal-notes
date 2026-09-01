-- Migration 0002 — what the approved design canvas demands of the schema
-- (DESIGN-SPEC §4). Four changes: document file details (name/type/size),
-- briefing deletion + structured sections, margin notes (briefing_notes),
-- and the append-only audit trail (audit_events).
-- Same discipline as 0001: org-scoped RLS through private.user_org_ids() on
-- every table, composite foreign keys so a child row can never point at
-- another organization's parent, a plain-English comment on every policy.
-- This file is committed BEFORE it is applied (constitution R4); the
-- dispatcher applies it and pastes the live verification into the SHIPLOG.

-- ---------------------------------------------------------------------------
-- documents: the canvas shows a file icon with an extension label, a byte
-- size, and (for uploads) the original file name on every tile and sheet.
-- ---------------------------------------------------------------------------

alter table public.documents
  -- Paste-created documents have no underlying file, so the name is nullable.
  add column file_name  text,
  add column ext        text   not null default 'TXT'
    check (ext in ('PDF', 'DOCX', 'TXT', 'MD', 'RTF', 'WEB')),
  add column size_bytes bigint not null default 0;

-- Backfill the rows that predate this migration, in this same migration:
-- their size is the byte length of the extracted text we already hold, and
-- their type follows their kind (web copy was fetched from the web; every
-- other pre-canvas document arrived as pasted text).
update public.documents
set
  size_bytes = octet_length(body),
  ext        = case when kind = 'web_copy' then 'WEB' else 'TXT' end;

-- ---------------------------------------------------------------------------
-- briefings: the canvas has a Delete control on briefing cards, and the
-- reading view renders structured sections with citation tooltips plus a
-- word/citation count in the meta line.
-- ---------------------------------------------------------------------------

alter table public.briefings
  -- Structured sections + citations (head, paragraphs, citation refs with
  -- document_id / passage label / exact quote) for the reading view; NULL
  -- until a generation writes them.
  add column sections       jsonb,
  add column word_count     integer,
  add column citation_count integer;

-- Children (sources, feedback, log lines, and this migration's notes and
-- audit rows) already cascade away via 0001-style composite foreign keys.
create policy briefings_delete on public.briefings
  for delete to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy briefings_delete on public.briefings is
  'You can delete a briefing only if it belongs to one of your organizations.';

-- ---------------------------------------------------------------------------
-- briefing_notes: the margin comments a reader leaves on one section of a
-- briefing (the accent-bordered cards in the canvas reading view).
-- ---------------------------------------------------------------------------

create table public.briefing_notes (
  id            uuid primary key default gen_random_uuid(),
  briefing_id   uuid not null,
  org_id        uuid not null references public.organizations (id),
  user_id       uuid not null references auth.users (id) on delete cascade,
  section_index integer not null check (section_index >= 0),
  body          text not null,
  created_at    timestamptz not null default now(),
  -- The briefing must exist AND belong to this row's own org, so a margin
  -- note can never be attached to another organization's briefing.
  foreign key (briefing_id, org_id) references public.briefings (id, org_id) on delete cascade
);

create index briefing_notes_org_id_idx on public.briefing_notes (org_id);
create index briefing_notes_briefing_id_section_index_idx
  on public.briefing_notes (briefing_id, section_index);

alter table public.briefing_notes enable row level security;

create policy briefing_notes_select on public.briefing_notes
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy briefing_notes_select on public.briefing_notes is
  'You can read margin notes only inside your own organization.';

create policy briefing_notes_insert on public.briefing_notes
  for insert to authenticated
  with check (
    org_id in (select private.user_org_ids())
    and user_id = (select auth.uid())
  );
comment on policy briefing_notes_insert on public.briefing_notes is
  'You can leave a margin note only inside your own organization, and only under your own name.';

-- No UPDATE policy exists on purpose: the canvas offers only Delete on your
-- own notes, so editing a note is delete + re-add, and a saved note can never
-- be silently rewritten in place.
create policy briefing_notes_delete on public.briefing_notes
  for delete to authenticated
  using (
    org_id in (select private.user_org_ids())
    and user_id = (select auth.uid())
  );
comment on policy briefing_notes_delete on public.briefing_notes is
  'You can delete only your own margin notes, and only inside your own organization.';

-- ---------------------------------------------------------------------------
-- audit_events: the append-only trail behind the AUDIT TRAIL panel and each
-- document's FILE HISTORY (RUN STARTED, SOURCE BOUND, TOOL CALL, CHECK,
-- COMPLETE, RATED, VIEWED, NOTE; document events UPLOADED, TITLE EDITED,
-- READ BY BRIEFING). A row may concern a briefing, a document, or both.
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations (id),
  briefing_id   uuid,
  document_id   uuid,
  event         text not null,
  detail        text not null,
  -- Display label only (e.g. 'ANA', 'SYSTEM'), derived server-side from the
  -- verified identity below — never from client input.
  actor         text not null,
  -- The verified identity behind a human-written line. NULL means SYSTEM: no
  -- policy grants a NULL here, so system lines can only be written with the
  -- service role — an authenticated user cannot forge one (or sign anyone
  -- else's name; see the insert policy).
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  -- Each composite reference below is only enforced when its id column is
  -- non-null — that is the composite-FK MATCH SIMPLE default (a NULL in any
  -- referencing column skips the check; org_id itself is NOT NULL, so a
  -- non-null id is always checked together with this row's own org).
  -- ON DELETE SET NULL (id column only, PG15 column-list form): audit rows
  -- SURVIVE the deletion of what they describe — the link is blanked, the
  -- line stays, still org-scoped through its own NOT NULL org_id.
  -- A surviving row may legitimately end up with BOTH ids NULL (its briefing
  -- and document both deleted), which is exactly why there is deliberately NO
  -- at-least-one-id check constraint on this table.
  -- When the briefing id is set, that briefing must exist AND belong to this
  -- row's own org, so an audit line can never be attached to another
  -- organization's briefing.
  foreign key (briefing_id, org_id) references public.briefings (id, org_id)
    on delete set null (briefing_id),
  -- When the document id is set, that document must exist AND belong to this
  -- row's own org, so an audit line can never be attached to another
  -- organization's document.
  foreign key (document_id, org_id) references public.documents (id, org_id)
    on delete set null (document_id)
);

create index audit_events_org_id_idx      on public.audit_events (org_id);
create index audit_events_briefing_id_idx on public.audit_events (briefing_id);
create index audit_events_document_id_idx on public.audit_events (document_id);

alter table public.audit_events enable row level security;

create policy audit_events_select on public.audit_events
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy audit_events_select on public.audit_events is
  'You can read the audit trail only inside your own organization.';

-- No UPDATE and no DELETE policies exist on purpose: the trail is append-only
-- by design (the canvas labels it APPEND-ONLY). Once written, a line can
-- neither be edited nor removed from the app — and deleting its briefing or
-- document does not take the line with it (the FKs above only blank the
-- link), so deleting the subject can never erase its history.
create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (
    org_id in (select private.user_org_ids())
    and actor_user_id = (select auth.uid())
  );
comment on policy audit_events_insert on public.audit_events is
  'You can write an audit line only inside your own organization, and only signed with your own verified identity.';
