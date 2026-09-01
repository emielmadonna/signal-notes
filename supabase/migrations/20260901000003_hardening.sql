-- Migration 0003 — hardening pass from the adversarial audit.
-- Three changes, each closing a gap where the SCHEMA'S OWN COMMENTS claimed a
-- guarantee the schema did not actually enforce:
--
--   1. audit_events.actor is now genuinely stamped server-side (it was free
--      text a browser client could set to 'SYSTEM' or to someone else's label).
--   2. updated_at now actually updates (it defaulted to now() and was never
--      touched again, so it was permanently equal to created_at).
--   3. A tamper-proof, cross-instance rate limiter for the three expensive
--      endpoints (there was none at all).
--
-- Same discipline as 0001/0002: org-scoped, SECURITY DEFINER helpers pinned to
-- an empty search_path, a plain-English comment on everything.
-- This file is committed BEFORE it is applied (constitution R4); until the
-- dispatcher applies it, the verifier's R4 check reports it as a ghost
-- migration — which is the check working, not a failure of this file.

-- ---------------------------------------------------------------------------
-- 1. audit_events.actor — stamped, not accepted.
--
-- 0002's column comment claimed actor was "derived server-side from the
-- verified identity below — never from client input" and that an
-- authenticated user "cannot forge one (or sign anyone else's name)". The
-- INSERT policy only ever constrained actor_user_id. `actor` — the column the
-- reading view actually RENDERS, and which it special-cases when it equals
-- 'SYSTEM' — was free text, and audit rows are inserted from browser code
-- holding the anon key. Any signed-in user could sign a line 'SYSTEM'.
--
-- The trigger below makes the original comment true: for any insert carrying
-- an end-user identity, both the label and the id are overwritten from the
-- verified JWT and whatever the client sent is discarded. Service-role writes
-- (the seed script's SYSTEM lines) have no auth.uid() and keep their label —
-- and the RLS policy already forbids an authenticated user from writing a row
-- with a NULL actor_user_id, so that path stays closed to them.
-- ---------------------------------------------------------------------------

create or replace function private.stamp_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := (select auth.jwt() ->> 'email');
begin
  if v_uid is null then
    -- No end-user identity on this connection: a service-role/system write.
    -- Leave the supplied actor alone; RLS keeps authenticated users out.
    return new;
  end if;
  new.actor_user_id := v_uid;
  new.actor := upper(split_part(coalesce(nullif(v_email, ''), 'user'), '@', 1));
  return new;
end;
$$;

comment on function private.stamp_audit_actor() is
  'Overwrites audit_events.actor and .actor_user_id from the verified JWT, so the rendered label cannot be forged by a client.';

create trigger audit_events_stamp_actor
  before insert on public.audit_events
  for each row execute function private.stamp_audit_actor();

comment on column public.audit_events.actor is
  'Display label (e.g. ''ANA'', ''SYSTEM''). ENFORCED server-side by the audit_events_stamp_actor trigger: an authenticated insert has this overwritten from the verified JWT email, so a client cannot choose its own label or sign anyone else''s name. Only a service-role write (no auth.uid()) may set it directly.';

-- ---------------------------------------------------------------------------
-- 2. updated_at — a column that updates.
--
-- documents.updated_at and briefing_feedback.updated_at both defaulted to
-- now() and were never written again by anything: no trigger, and no app code
-- set them. Every row's updated_at was therefore identical to its created_at,
-- which is worse than having no column at all — the UI could truthfully have
-- shown "edited 3 days ago" for a row edited a minute ago.
-- ---------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.touch_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with the transaction time, so the column reflects the real last write.';

create trigger documents_touch_updated_at
  before update on public.documents
  for each row execute function private.touch_updated_at();

create trigger briefing_feedback_touch_updated_at
  before update on public.briefing_feedback
  for each row execute function private.touch_updated_at();

-- Existing rows carry a truthful-but-stale value already (updated_at =
-- created_at, and nothing has ever edited them through a path that would have
-- moved it), so there is deliberately no backfill here: inventing edit times
-- we never observed is exactly the kind of claim the constitution forbids.

-- ---------------------------------------------------------------------------
-- 3. Rate limiting — fixed-window counters, in the database.
--
-- There was none. Combined with /api/documents/fetch-url being an
-- authenticated outbound HTTP fetcher and /api/briefings/generate spending up
-- to 16 model turns per call, one account could use this app as a scanner and
-- run the model bill up without bound.
--
-- The counter lives in Postgres rather than in process memory precisely
-- because the app is serverless: an in-memory limiter would reset on every
-- cold start and be trivially defeated by concurrency across instances.
--
-- The LIMITS ARE NOT A PARAMETER. The RPC takes only a bucket name and looks
-- its ceiling up in the CASE below, so a caller cannot ask for a bigger
-- allowance than the server intends; an unknown bucket is denied outright.
-- ---------------------------------------------------------------------------

create table private.rate_limits (
  subject      text        not null, -- '<bucket>:<user uuid>'
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (subject, window_start)
);

comment on table private.rate_limits is
  'Fixed-window request counters, one row per (bucket+user, window). Reachable only through private.consume_rate_limit(); no direct grants.';

-- Nobody touches this table directly — only the definer function below.
revoke all on table private.rate_limits from public;
alter table private.rate_limits enable row level security;
-- RLS on with zero policies = deny-all for any role that isn't the owner or
-- a BYPASSRLS role. Belt and braces alongside the missing grants.

create or replace function private.consume_rate_limit(p_bucket text)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_limit        integer;
  v_window       integer;
  v_subject      text;
  v_window_start timestamptz;
  v_count        integer;
begin
  -- Server-defined ceilings. The caller chooses WHICH bucket, never HOW BIG.
  case p_bucket
    when 'fetch-url' then v_limit := 20;  v_window := 300;   -- 20 / 5 min
    when 'upload'    then v_limit := 30;  v_window := 300;   -- 30 / 5 min
    when 'generate'  then v_limit := 10;  v_window := 3600;  -- 10 / hour
    else
      -- Unknown bucket: deny. A typo in the app must fail closed, not open.
      return query select false, 0, 3600;
      return;
  end case;

  if v_uid is null then
    -- No verified identity: nothing to meter against. Callers all authenticate
    -- before reaching here, so this is a fail-closed backstop.
    return query select false, 0, v_window;
    return;
  end if;

  v_subject := p_bucket || ':' || v_uid::text;
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / v_window) * v_window
  );

  insert into private.rate_limits as rl (subject, window_start, count)
  values (v_subject, v_window_start, 1)
  on conflict (subject, window_start)
    do update set count = rl.count + 1
  returning rl.count into v_count;

  -- Keep the table bounded: one row per subject survives each call.
  delete from private.rate_limits
   where subject = v_subject and window_start < v_window_start;

  return query select
    (v_count <= v_limit),
    greatest(v_limit - v_count, 0),
    ceil(extract(epoch from
      (v_window_start + make_interval(secs => v_window)) - clock_timestamp()
    ))::integer;
end;
$$;

comment on function private.consume_rate_limit(text) is
  'Counts one request for (bucket, calling user) in the current fixed window and reports whether it is within the server-defined ceiling for that bucket. Limits are hardcoded here, never passed in.';

revoke all on function private.consume_rate_limit(text) from public;
grant execute on function private.consume_rate_limit(text) to authenticated;

-- PostgREST only exposes functions in the API schemas (public), so the app
-- cannot call private.consume_rate_limit directly. This thin SECURITY INVOKER
-- wrapper is the callable surface; it adds no privilege of its own — it just
-- forwards to the definer function above, whose ceilings still apply.
create or replace function public.consume_rate_limit(p_bucket text)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language sql
security invoker
set search_path = ''
as $$
  select * from private.consume_rate_limit(p_bucket);
$$;

comment on function public.consume_rate_limit(text) is
  'API-reachable wrapper over private.consume_rate_limit(). Meters one request for the calling user against that bucket''s server-defined ceiling.';

revoke all on function public.consume_rate_limit(text) from public;
grant execute on function public.consume_rate_limit(text) to authenticated;
