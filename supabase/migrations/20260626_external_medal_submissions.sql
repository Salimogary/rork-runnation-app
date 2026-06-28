alter table public.external_activity_submissions
  drop constraint if exists external_activity_submissions_source_type_check;

alter table public.external_activity_submissions
  add column if not exists external_event_name text null,
  add column if not exists external_event_location text null,
  add column if not exists external_event_id text null references public.events(event_id) on delete set null,
  add column if not exists approved_activity_id text null references public.activities(activity_id) on delete set null;

alter table public.external_activity_submissions
  add constraint external_activity_submissions_source_type_check
  check (
    source_type is null
    or source_type in ('smart_watch', 'other_sports_app', 'medal_claim')
  );

create index if not exists idx_external_activity_submissions_medal_claim
  on public.external_activity_submissions using btree (source_type, activity_date)
  where source_type = 'medal_claim';

comment on column public.external_activity_submissions.external_event_name is
  'Event name entered by the runner for an external medal claim.';

comment on column public.external_activity_submissions.external_event_location is
  'Location entered by the runner for an external medal claim.';

comment on column public.external_activity_submissions.external_event_id is
  'RunNation event row created when an external medal claim is approved.';
