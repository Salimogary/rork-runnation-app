update public.faq_entries
set answer = 'Special clubs are global RunNation clubs with their own eligibility rules. Junior Runners is for users aged 8 to 15. Golden Age Runners is for users aged 60 and above. Para Runners is available when your profile says you have a disability. Treadmill Runners is available when your profile says you do indoor workouts. SmartFit Club is available when your profile says you use a smart watch to record workouts and you have selected General Health as one of your goals.'
where question = 'What are RunNation special clubs?';

insert into public.faq_entries (question, answer, display_order, is_active)
select
  'Who can join each special club?',
  'Junior Runners is for users aged 8 to 15. Golden Age Runners is for users aged 60 and above. Para Runners is available when your profile says you have a disability. Treadmill Runners is available when your profile says you do indoor workouts. SmartFit Club is available when your profile says you use a smart watch to record workouts and you have selected General Health as one of your goals.',
  191,
  true
where not exists (
  select 1
  from public.faq_entries
  where question = 'Who can join each special club?'
);
