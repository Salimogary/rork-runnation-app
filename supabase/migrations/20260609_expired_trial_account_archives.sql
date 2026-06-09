alter table public.registrations
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text;

create table if not exists public.user_account_archives (
  archive_id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique,
  country text,
  display_name text,
  username text,
  registered_at timestamptz,
  trial_ended_at timestamptz,
  archived_at timestamptz not null default now(),
  archive_reason text not null,
  activity_count integer not null default 0,
  last_activity_date date
);

create table if not exists public.activities_archive
  (like public.activities including defaults including constraints);

alter table public.user_account_archives enable row level security;

create or replace function public.archive_expired_trial_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_count integer := 0;
begin
  with restored_accounts as (
    select uaa.registration_id
    from public.user_account_archives uaa
    where exists (
      select 1
      from public.subscriptions s
      where s.registration_id = uaa.registration_id
        and lower(coalesce(s.status, '')) in ('active', 'paid', 'trialing')
        and (s.expires_at is null or s.expires_at > now())
    )
    or exists (
      select 1
      from public.profiles p
      join public.user_role_assignments ura on ura.user_id = p.profile_id
      where p.registration_id = uaa.registration_id
        and ura.is_active = true
    )
  ),
  restored_activities as (
    insert into public.activities (
      activity_id,
      registration_id,
      activity_date,
      exercise_type,
      distance_km,
      start_time,
      end_time,
      pace_min_per_km,
      pause_duration_seconds
    )
    select
      a.activity_id,
      a.registration_id,
      a.activity_date,
      a.exercise_type,
      a.distance_km,
      a.start_time,
      a.end_time,
      a.pace_min_per_km,
      a.pause_duration_seconds
    from public.activities_archive a
    join restored_accounts r on r.registration_id = a.registration_id
    on conflict do nothing
  ),
  cleared_activity_archive as (
    delete from public.activities_archive a
    using restored_accounts r
    where a.registration_id = r.registration_id
  ),
  cleared_account_archive as (
    delete from public.user_account_archives uaa
    using restored_accounts r
    where uaa.registration_id = r.registration_id
  )
  update public.registrations r
  set archived_at = null, archive_reason = null
  from restored_accounts restored
  where r.registration_id = restored.registration_id;

  with candidates as (
    select
      r.registration_id,
      r.country,
      concat_ws(' ', r.first_name, r.other_names) as display_name,
      r.username,
      r.created_at,
      entitlement.entitlement_ended_at as trial_ended_at
    from public.registrations r
    cross join lateral (
      select greatest(
        r.created_at + interval '90 days',
        coalesce(max(s.expires_at), r.created_at + interval '90 days')
      ) as entitlement_ended_at
      from public.subscriptions s
      where s.registration_id = r.registration_id
    ) entitlement
    where r.archived_at is null
      and entitlement.entitlement_ended_at + interval '15 days' <= now()
      and coalesce(r.subscription, 1) <> 3
      and not exists (
        select 1
        from public.subscriptions s
        where s.registration_id = r.registration_id
          and lower(coalesce(s.status, '')) in ('active', 'paid', 'trialing')
          and (s.expires_at is null or s.expires_at > now())
      )
      and not exists (
        select 1
        from public.profiles p
        join public.user_role_assignments ura on ura.user_id = p.profile_id
        where p.registration_id = r.registration_id
          and ura.is_active = true
      )
  ),
  archived_rows as (
    insert into public.user_account_archives (
      registration_id,
      country,
      display_name,
      username,
      registered_at,
      trial_ended_at,
      archived_at,
      archive_reason,
      activity_count,
      last_activity_date
    )
    select
      c.registration_id,
      c.country,
      nullif(trim(c.display_name), ''),
      c.username,
      c.created_at,
      c.trial_ended_at,
      now(),
      'trial_expired_unrenewed_15_days',
      count(a.activity_id)::integer,
      max(a.activity_date)::date
    from candidates c
    left join public.activities a on a.registration_id = c.registration_id
    group by c.registration_id, c.country, c.display_name, c.username, c.created_at, c.trial_ended_at
    on conflict (registration_id) do update set
      country = excluded.country,
      display_name = excluded.display_name,
      username = excluded.username,
      registered_at = excluded.registered_at,
      trial_ended_at = excluded.trial_ended_at,
      archived_at = excluded.archived_at,
      archive_reason = excluded.archive_reason,
      activity_count = excluded.activity_count,
      last_activity_date = excluded.last_activity_date
    returning registration_id
  ),
  moved_activities as (
    insert into public.activities_archive (
      activity_id,
      registration_id,
      activity_date,
      exercise_type,
      distance_km,
      start_time,
      end_time,
      pace_min_per_km,
      pause_duration_seconds
    )
    select
      a.activity_id,
      a.registration_id,
      a.activity_date,
      a.exercise_type,
      a.distance_km,
      a.start_time,
      a.end_time,
      a.pace_min_per_km,
      a.pause_duration_seconds
    from public.activities a
    join archived_rows ar on ar.registration_id = a.registration_id
    on conflict do nothing
    returning registration_id
  ),
  deleted_activities as (
    delete from public.activities a
    using archived_rows ar
    where a.registration_id = ar.registration_id
    returning a.registration_id
  )
  update public.registrations r
  set
    archived_at = now(),
    archive_reason = 'trial_expired_unrenewed_15_days'
  from archived_rows ar
  where r.registration_id = ar.registration_id;

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

create or replace function public.purge_archived_account(target_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile_id uuid;
  table_row record;
begin
  if not exists (
    select 1
    from public.user_account_archives
    where registration_id = target_registration_id
  ) then
    raise exception 'Only archived accounts can be deleted';
  end if;

  select profile_id
  into target_profile_id
  from public.profiles
  where registration_id = target_registration_id
  limit 1;

  for table_row in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'registration_id'
      and table_name not in ('registrations', 'user_account_archives')
  loop
    execute format(
      'delete from %I.%I where registration_id = $1',
      table_row.table_schema,
      table_row.table_name
    ) using target_registration_id;
  end loop;

  if target_profile_id is not null then
    delete from public.user_role_assignments where user_id = target_profile_id;
  end if;

  delete from public.profiles where registration_id = target_registration_id;
  delete from public.user_account_archives where registration_id = target_registration_id;
  delete from public.registrations where registration_id = target_registration_id;
end;
$$;

revoke all on function public.archive_expired_trial_accounts() from public, anon, authenticated;
revoke all on function public.purge_archived_account(uuid) from public, anon, authenticated;
grant execute on function public.archive_expired_trial_accounts() to service_role;
grant execute on function public.purge_archived_account(uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'archive-expired-runnation-trials') then
      perform cron.schedule(
        'archive-expired-runnation-trials',
        '17 2 * * *',
        'select public.archive_expired_trial_accounts();'
      );
    end if;
  end if;
end
$$;
