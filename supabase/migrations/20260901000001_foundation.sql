-- Migration 0001 — foundation schema for Signal Notes.
-- Seven tables, org-scoped RLS on every one of them (constitution R1).
-- This file is committed BEFORE it is applied (constitution R4); the dispatcher
-- applies it and pastes the live verification into the SHIPLOG.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id     uuid not null references public.organizations (id),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id),
  title      text not null,
  kind       text not null check (kind in ('interview_notes', 'call_transcript', 'web_copy', 'other')),
  body       text not null,
  added_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets child tables reference (id, org_id) as a pair, so a link can never
  -- point at a document in a different organization.
  unique (id, org_id)
);

create table public.briefings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id),
  title        text,
  status       text not null default 'generating' check (status in ('generating', 'complete', 'failed')),
  body_md      text,
  model        text not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  -- Lets child tables reference (id, org_id) as a pair, so a link can never
  -- point at a briefing in a different organization.
  unique (id, org_id)
);

create table public.briefing_sources (
  briefing_id uuid not null,
  document_id uuid not null,
  org_id      uuid not null references public.organizations (id),
  primary key (briefing_id, document_id),
  -- The briefing must exist AND belong to this row's own org, so a grounding
  -- link can never point at another organization's briefing.
  foreign key (briefing_id, org_id) references public.briefings (id, org_id) on delete cascade,
  -- The document must exist AND belong to this row's own org, so a briefing
  -- can never be grounded in another organization's document.
  foreign key (document_id, org_id) references public.documents (id, org_id) on delete cascade
);

create table public.briefing_feedback (
  id          uuid primary key default gen_random_uuid(),
  briefing_id uuid not null,
  org_id      uuid not null references public.organizations (id),
  user_id     uuid not null references auth.users (id) on delete cascade,
  rating      text not null check (rating in ('up', 'down')),
  annotation  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (briefing_id, user_id),
  -- The briefing must exist AND belong to this row's own org, so feedback can
  -- never be attached to another organization's briefing.
  foreign key (briefing_id, org_id) references public.briefings (id, org_id) on delete cascade
);

create table public.generation_events (
  id          bigint generated always as identity primary key,
  briefing_id uuid not null,
  org_id      uuid not null references public.organizations (id),
  kind        text not null check (kind in ('status', 'thinking', 'tool_call', 'text_delta')),
  content     text not null,
  created_at  timestamptz not null default now(),
  -- The briefing must exist AND belong to this row's own org, so a log line
  -- can never be attached to another organization's briefing.
  foreign key (briefing_id, org_id) references public.briefings (id, org_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Indexes: every org_id column, and every briefing_id foreign key.
-- (org_members and briefing_sources lead their primary keys with org_id /
--  briefing_id respectively, so those two are already covered by the pk index.)
-- ---------------------------------------------------------------------------

create index org_members_user_id_idx        on public.org_members (user_id);
create index documents_org_id_idx           on public.documents (org_id);
create index briefings_org_id_idx           on public.briefings (org_id);
create index briefing_sources_org_id_idx    on public.briefing_sources (org_id);
create index briefing_sources_document_id_idx on public.briefing_sources (document_id);
create index briefing_feedback_org_id_idx   on public.briefing_feedback (org_id);
create index briefing_feedback_briefing_id_idx on public.briefing_feedback (briefing_id);
create index generation_events_org_id_idx   on public.generation_events (org_id);
create index generation_events_briefing_id_idx on public.generation_events (briefing_id);

-- ---------------------------------------------------------------------------
-- Helper: which orgs does the signed-in user belong to?
-- SECURITY DEFINER so it can read org_members without tripping that table's
-- own RLS (which would recurse). STABLE, search_path pinned empty so nothing
-- can shadow the tables it touches.
-- ---------------------------------------------------------------------------

create schema private;

create or replace function private.user_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select om.org_id
  from public.org_members om
  where om.user_id = (select auth.uid());
$$;

-- Only signed-in users may call the helper; nobody anonymous.
revoke all on function private.user_org_ids() from public;
grant usage on schema private to authenticated;
grant execute on function private.user_org_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: ENABLED on every table, including the children.
-- Every policy is ORG-scoped through private.user_org_ids(). No
-- service_role-only shortcuts anywhere.
-- ---------------------------------------------------------------------------

alter table public.organizations     enable row level security;
alter table public.org_members       enable row level security;
alter table public.documents         enable row level security;
alter table public.briefings         enable row level security;
alter table public.briefing_sources  enable row level security;
alter table public.briefing_feedback enable row level security;
alter table public.generation_events enable row level security;

-- organizations: members can see their own orgs; nobody can create, rename,
-- or delete orgs from the app (orgs are seeded), so no other policies exist.
create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select private.user_org_ids()));
comment on policy organizations_select on public.organizations is
  'You can see an organization only if you are a member of it.';

-- org_members: users may see the membership rows of their own orgs.
create policy org_members_select on public.org_members
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy org_members_select on public.org_members is
  'You can see who is in an organization only if you belong to it yourself.';

-- documents: full read/write within your own org, nothing outside it.
create policy documents_select on public.documents
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy documents_select on public.documents is
  'You can read a document only if it belongs to one of your organizations.';

create policy documents_insert on public.documents
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));
comment on policy documents_insert on public.documents is
  'You can add a document only into one of your own organizations.';

create policy documents_update on public.documents
  for update to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));
comment on policy documents_update on public.documents is
  'You can edit a document only inside your own organization, and you cannot move it to another one.';

create policy documents_delete on public.documents
  for delete to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy documents_delete on public.documents is
  'You can delete a document only if it belongs to one of your organizations.';

-- briefings: read and write within your own org.
create policy briefings_select on public.briefings
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy briefings_select on public.briefings is
  'You can read a briefing only if it belongs to one of your organizations.';

create policy briefings_insert on public.briefings
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));
comment on policy briefings_insert on public.briefings is
  'You can create a briefing only inside one of your own organizations.';

create policy briefings_update on public.briefings
  for update to authenticated
  using (org_id in (select private.user_org_ids()))
  with check (org_id in (select private.user_org_ids()));
comment on policy briefings_update on public.briefings is
  'You can update a briefing only inside your own organization, and you cannot move it to another one.';

-- briefing_sources: read and append within your own org. Grounding links are
-- write-once — no update policy exists on purpose, so the record of which
-- documents fed a briefing can never be rewritten (though deleting a source
-- document or its briefing does cascade the link away with it).
create policy briefing_sources_select on public.briefing_sources
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy briefing_sources_select on public.briefing_sources is
  'You can see which documents fed a briefing only inside your own organization.';

create policy briefing_sources_insert on public.briefing_sources
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));
comment on policy briefing_sources_insert on public.briefing_sources is
  'You can link a document to a briefing only inside your own organization.';

-- briefing_feedback: read within your org; write only your own feedback,
-- and only inside your org.
create policy briefing_feedback_select on public.briefing_feedback
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy briefing_feedback_select on public.briefing_feedback is
  'You can read feedback only inside your own organization.';

create policy briefing_feedback_insert on public.briefing_feedback
  for insert to authenticated
  with check (
    org_id in (select private.user_org_ids())
    and user_id = (select auth.uid())
  );
comment on policy briefing_feedback_insert on public.briefing_feedback is
  'You can leave feedback only inside your own organization, and only under your own name.';

create policy briefing_feedback_update on public.briefing_feedback
  for update to authenticated
  using (
    org_id in (select private.user_org_ids())
    and user_id = (select auth.uid())
  )
  with check (
    org_id in (select private.user_org_ids())
    and user_id = (select auth.uid())
  );
comment on policy briefing_feedback_update on public.briefing_feedback is
  'You can change only your own feedback, and only inside your own organization.';

-- generation_events: read and append within your own org. The activity log is
-- append-only by design — no update policy exists on purpose, so a briefing's
-- replay (rule 8) can never be edited after the fact.
create policy generation_events_select on public.generation_events
  for select to authenticated
  using (org_id in (select private.user_org_ids()));
comment on policy generation_events_select on public.generation_events is
  'You can read a briefing''s activity log only inside your own organization.';

create policy generation_events_insert on public.generation_events
  for insert to authenticated
  with check (org_id in (select private.user_org_ids()));
comment on policy generation_events_insert on public.generation_events is
  'You can write an activity-log line only inside your own organization.';
