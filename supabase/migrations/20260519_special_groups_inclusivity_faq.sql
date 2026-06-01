begin;

update public.faq_entries
set
  answer = 'RunNation is intentionally built to include special groups such as Junior Runners, Golden Age Runners, Para Runners, Treadmill Runners, SmartFit users, beginners, and other eligible communities. These groups may have dedicated clubs, coordinator roles, reports, safeguards, and ranking views. For example, juniors compete within their own running community rather than adult/general rankings, while para adults may still appear in wider community views where appropriate but are mainly supported through their special group.',
  display_order = 180,
  is_active = true,
  updated_at = now()
where lower(question) = lower('How does RunNation support special running groups?');

insert into public.faq_entries (question, answer, display_order, is_active)
select
  'How does RunNation support special running groups?',
  'RunNation is intentionally built to include special groups such as Junior Runners, Golden Age Runners, Para Runners, Treadmill Runners, SmartFit users, beginners, and other eligible communities. These groups may have dedicated clubs, coordinator roles, reports, safeguards, and ranking views. For example, juniors compete within their own running community rather than adult/general rankings, while para adults may still appear in wider community views where appropriate but are mainly supported through their special group.',
  180,
  true
where not exists (
  select 1
  from public.faq_entries
  where lower(question) = lower('How does RunNation support special running groups?')
);

commit;
