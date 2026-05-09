insert into public.faq_entries (question, answer, display_order, is_active)
select
  'Can I hold more than one role at a time?',
  'No.',
  170,
  true
where not exists (
  select 1
  from public.faq_entries
  where lower(question) = lower('Can I hold more than one role at a time?')
);
