do $$
declare
  target record;
begin
  for target in
    select *
    from (
      values
        ('activities', 'activity_id'),
        ('events_participants', 'event_participant_id'),
        ('event_enrollments', 'event_enrollment_id'),
        ('external_activity_submissions', 'pending_activity_id'),
        ('social_posts', 'social_post_id'),
        ('social_comments', 'comment_id'),
        ('social_poll_votes', 'vote_id'),
        ('social_mentions', 'mention_id'),
        ('social_post_reactions', 'reaction_id'),
        ('social_comment_reactions', 'reaction_id'),
        ('event_organizers', 'organizer_id')
    ) as t(table_name, column_name)
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target.table_name
        and column_name = target.column_name
        and data_type = 'uuid'
    ) then
      execute format(
        'alter table public.%I alter column %I set default gen_random_uuid()',
        target.table_name,
        target.column_name
      );
    end if;
  end loop;
end $$;
