alter table public.activities
  add column if not exists steps_count integer null;

alter table public.external_activity_submissions
  add column if not exists steps_count integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'activities_steps_count_nonnegative'
  ) then
    alter table public.activities
      add constraint activities_steps_count_nonnegative
      check (steps_count is null or steps_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_activity_submissions_steps_count_nonnegative'
  ) then
    alter table public.external_activity_submissions
      add constraint external_activity_submissions_steps_count_nonnegative
      check (steps_count is null or steps_count >= 0);
  end if;
end $$;

comment on column public.activities.steps_count is
  'Step count recorded for step-based workout types such as Stairs.';

comment on column public.external_activity_submissions.steps_count is
  'Submitted step count for step-based manual activities awaiting approval.';
