insert into public.faq_entries (question, answer, display_order, is_active)
select
  'How do I join my club WhatsApp group?',
  'Go to Profile > My Clubs and look for the WhatsApp column or Join button beside your club. The button appears only for clubs you belong to after a club coordinator or admin has saved that club''s WhatsApp invite link.',
  45,
  true
where not exists (
  select 1
  from public.faq_entries
  where lower(question) = lower('How do I join my club WhatsApp group?')
);
