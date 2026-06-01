alter table public.external_activity_submissions
  add column if not exists source_type text,
  add column if not exists source_label text,
  add column if not exists evidence_path text,
  add column if not exists evidence_mime_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_activity_submissions_source_type_check'
  ) then
    alter table public.external_activity_submissions
      add constraint external_activity_submissions_source_type_check
      check (
        source_type is null
        or source_type in ('smart_watch', 'other_sports_app')
      );
  end if;
end $$;

create index if not exists idx_external_activity_submissions_source_type
  on public.external_activity_submissions using btree (source_type)
  where source_type is not null;
