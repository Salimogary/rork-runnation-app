begin;

update public.faq_entries
set is_active = false,
    updated_at = now();

with faq_seed(question, answer, display_order) as (
  values
    (
      'How do events, approvals, and event payments work?',
      'Events may be free, approval-based, paid, virtual, local, recurring, same-day, or multiday. Your enrollment may be confirmed immediately, sent to an admin or club coordinator for review, or held until payment is confirmed.',
      10
    ),
    (
      'Why can''t I join some events or shop in some countries?',
      'Some events and shop items are country-specific. Travel settings may temporarily open eligible events in another country, while paid events, shop orders, and delivery remain subject to country, currency, and admin processing rules.',
      20
    ),
    (
      'How do activity uploads and treadmill activities get approved?',
      'Manual, smart watch, sports-app, and treadmill submissions can enter an admin review queue when proof or event credit is needed. Treadmill activity counts for workouts and goals but not event credit unless a future event specifically allows it.',
      30
    ),
    (
      'How do clubs and special clubs work?',
      'A user may have one normal club plus any number of eligible special clubs. Normal club membership requires approval by the relevant coordinator, while eligible special clubs may be added automatically from profile and goal criteria.',
      40
    ),
    (
      'Who can join each special club?',
      'Junior Runners is for users aged 8 to 15. Golden Age Runners is for users aged 60 and above. Para Runners is available when your profile says you have a disability, with an extra equipment question for wheelchair, handcycle, prosthetic blades, or other gear. Treadmill Runners is available when your profile says you do indoor workouts. SmartFit Club is available when your profile says you use a smart watch to record workouts and you have selected General Health as one of your goals.',
      50
    ),
    (
      'How does RunNation support special running groups?',
      'RunNation is intentionally built for inclusion. Juniors compete within their own running community rather than adult/general rankings. Para users who use equipment stay in Para club leaderboards for exercise and appear in separate Para athlete event sections; para users with no gear can also appear in general community leaderboards. Golden Age, Treadmill, and SmartFit users also get relevant reports and club views.',
      60
    ),
    (
      'Why does profile completion matter?',
      'Profile fields drive important eligibility and safety rules, including age groups, country, clubs, SmartFit eligibility, Para and Treadmill options, goals, reports, rankings, service roles, and admin visibility. Missing fields can hide features that depend on those inputs.',
      70
    ),
    (
      'How do goals, scorecards, and special club rankings connect?',
      'Goal pages show the goals you selected. Related special club ranks may appear where relevant, such as SmartFit rank inside General Health. Unselected goals may be shown separately as inactive options rather than mixed into your active scorecard.',
      80
    ),
    (
      'What does Private Mode do?',
      'Private Mode hides your data from public leaderboards and community-style views where the app supports that setting. You can still use your core account features normally.',
      90
    ),
    (
      'How do admin and service team roles work?',
      'Eligible users can apply through Join Service Team for roles such as club coordinator, country coordinator, event organizer, shop manager, special club coordinator, or approved magazine roles. Requests may include optional suitability notes, links, and contact instructions. Most users may hold only one active service role at a time.',
      100
    ),
    (
      'Can under-18 users hold service roles?',
      'Under-18 users generally cannot hold service roles. The exceptional case is the Junior Runners Club Coordinator role, because that role exists specifically to support the junior community under the app''s safeguards.',
      110
    ),
    (
      'What happens when an admin resigns or a role is deleted?',
      'Non-Global Admins can submit a resignation request with a reason. The request stays pending for 12 hours unless a Global Admin acts sooner. Before admin access is deleted, RunNation stores a summarized resigned-admin audit log for accountability.',
      120
    ),
    (
      'Can a club coordinator delete a club?',
      'A club coordinator may request deletion for a club they created. If the club has no members it may be deleted immediately; if it has members, deletion stays pending for 12 hours and remains subject to the admin approval leg.',
      130
    ),
    (
      'How do donations work on RunNation?',
      'RunNation accepts voluntary donations to help support the app''s operational costs, development, and community mission as a growing startup platform. The app may record donation details such as donation intent, amount, payment option, country, and optional remarks.',
      140
    ),
    (
      'How does the RunNation reward system work?',
      'RunNation may recognize and reward users for outstanding participation and contribution within the community. Rewards may be based on independent community polls on the chat page, recommendations from admins, or special recognition by Management for exceptional contributions such as community support, suggestions, leadership, or engagement. Rewards may include running gear, merchandise, or complimentary subscription periods.',
      141
    ),
    (
      'How are community content, magazine submissions, and reports moderated?',
      'Admins may review chat reports, screenshots, social content, magazine articles, pictorials, activity uploads, and event-related submissions. Abusive, hateful, pornographic, divisive, sectarian, misleading, unsafe, or spam content may be rejected, restricted, removed, or escalated.',
      150
    )
)
update public.faq_entries target
set answer = seed.answer,
    display_order = seed.display_order,
    is_active = true,
    updated_at = now()
from faq_seed seed
where target.question = seed.question;

with faq_seed(question, answer, display_order) as (
  values
    ('How do events, approvals, and event payments work?', 'Events may be free, approval-based, paid, virtual, local, recurring, same-day, or multiday. Your enrollment may be confirmed immediately, sent to an admin or club coordinator for review, or held until payment is confirmed.', 10),
    ('Why can''t I join some events or shop in some countries?', 'Some events and shop items are country-specific. Travel settings may temporarily open eligible events in another country, while paid events, shop orders, and delivery remain subject to country, currency, and admin processing rules.', 20),
    ('How do activity uploads and treadmill activities get approved?', 'Manual, smart watch, sports-app, and treadmill submissions can enter an admin review queue when proof or event credit is needed. Treadmill activity counts for workouts and goals but not event credit unless a future event specifically allows it.', 30),
    ('How do clubs and special clubs work?', 'A user may have one normal club plus any number of eligible special clubs. Normal club membership requires approval by the relevant coordinator, while eligible special clubs may be added automatically from profile and goal criteria.', 40),
    ('Who can join each special club?', 'Junior Runners is for users aged 8 to 15. Golden Age Runners is for users aged 60 and above. Para Runners is available when your profile says you have a disability, with an extra equipment question for wheelchair, handcycle, prosthetic blades, or other gear. Treadmill Runners is available when your profile says you do indoor workouts. SmartFit Club is available when your profile says you use a smart watch to record workouts and you have selected General Health as one of your goals.', 50),
    ('How does RunNation support special running groups?', 'RunNation is intentionally built for inclusion. Juniors compete within their own running community rather than adult/general rankings. Para users who use equipment stay in Para club leaderboards for exercise and appear in separate Para athlete event sections; para users with no gear can also appear in general community leaderboards. Golden Age, Treadmill, and SmartFit users also get relevant reports and club views.', 60),
    ('Why does profile completion matter?', 'Profile fields drive important eligibility and safety rules, including age groups, country, clubs, SmartFit eligibility, Para and Treadmill options, goals, reports, rankings, service roles, and admin visibility. Missing fields can hide features that depend on those inputs.', 70),
    ('How do goals, scorecards, and special club rankings connect?', 'Goal pages show the goals you selected. Related special club ranks may appear where relevant, such as SmartFit rank inside General Health. Unselected goals may be shown separately as inactive options rather than mixed into your active scorecard.', 80),
    ('What does Private Mode do?', 'Private Mode hides your data from public leaderboards and community-style views where the app supports that setting. You can still use your core account features normally.', 90),
    ('How do admin and service team roles work?', 'Eligible users can apply through Join Service Team for roles such as club coordinator, country coordinator, event organizer, shop manager, special club coordinator, or approved magazine roles. Requests may include optional suitability notes, links, and contact instructions. Most users may hold only one active service role at a time.', 100),
    ('Can under-18 users hold service roles?', 'Under-18 users generally cannot hold service roles. The exceptional case is the Junior Runners Club Coordinator role, because that role exists specifically to support the junior community under the app''s safeguards.', 110),
    ('What happens when an admin resigns or a role is deleted?', 'Non-Global Admins can submit a resignation request with a reason. The request stays pending for 12 hours unless a Global Admin acts sooner. Before admin access is deleted, RunNation stores a summarized resigned-admin audit log for accountability.', 120),
    ('Can a club coordinator delete a club?', 'A club coordinator may request deletion for a club they created. If the club has no members it may be deleted immediately; if it has members, deletion stays pending for 12 hours and remains subject to the admin approval leg.', 130),
    ('How do donations work on RunNation?', 'RunNation accepts voluntary donations to help support the app''s operational costs, development, and community mission as a growing startup platform. The app may record donation details such as donation intent, amount, payment option, country, and optional remarks.', 140),
    ('How does the RunNation reward system work?', 'RunNation may recognize and reward users for outstanding participation and contribution within the community. Rewards may be based on independent community polls on the chat page, recommendations from admins, or special recognition by Management for exceptional contributions such as community support, suggestions, leadership, or engagement. Rewards may include running gear, merchandise, or complimentary subscription periods.', 141),
    ('How are community content, magazine submissions, and reports moderated?', 'Admins may review chat reports, screenshots, social content, magazine articles, pictorials, activity uploads, and event-related submissions. Abusive, hateful, pornographic, divisive, sectarian, misleading, unsafe, or spam content may be rejected, restricted, removed, or escalated.', 150)
)
insert into public.faq_entries (question, answer, display_order, is_active)
select question, answer, display_order, true
from faq_seed
where not exists (
  select 1
  from public.faq_entries existing
  where existing.question = faq_seed.question
);

commit;
