begin;

update public.faq_entries
set
  answer = 'Open Events, choose the event, then tap Participate. Same-day, recurring, and multiday events may be free, approved, or paid. If payment is not yet enabled, paid events show that the payment link is under maintenance.',
  display_order = 10,
  is_active = true,
  updated_at = now()
where lower(question) = lower('How do I join an event?');

update public.faq_entries
set
  answer = 'Some events are limited by country, travel dates, organizer approval, payment status, event date window, or entry type. Your profile country and any active travel country can affect which events you can access.',
  display_order = 20,
  is_active = true,
  updated_at = now()
where lower(question) = lower('Why can''t I join some events?');

update public.faq_entries
set
  answer = 'Treadmill activities count for workouts, reports, and goals, but they do not count for event credit. Smart watch and other sports app imports can count for events only after the relevant club or organizer approves the evidence.',
  display_order = 40,
  is_active = true,
  updated_at = now()
where lower(question) = lower('How are treadmill activities approved?');

update public.faq_entries
set
  answer = 'Profile completion helps RunNation match you to the right events, clubs, country support, special clubs, goals, and safety rules. Age and nationality are required for registration and eligibility checks.',
  display_order = 50,
  is_active = true,
  updated_at = now()
where lower(question) = lower('Why does my profile completion matter?');

update public.faq_entries
set
  answer = 'No, most users can hold only one active admin or service role at a time. A normal user role may exist beside one approved admin/service role. Super Admins are exempt where needed for setup and operations.',
  display_order = 170,
  is_active = true,
  updated_at = now()
where lower(question) = lower('Can I hold more than one role at a time?');

insert into public.faq_entries (question, answer, display_order, is_active)
select seed.question, seed.answer, seed.display_order, true
from (
  values
    (
      'What is Join Service Team?',
      'Join Service Team is where eligible users apply for community roles such as Club Coordinator, Country Coordinator, Event Organizer, Shop Manager, special club coordinator, or approved magazine columnist. Available roles depend on country, global limits, and whether you already hold an active role.',
      180
    ),
    (
      'What are RunNation special clubs?',
      'Special clubs are global RunNation clubs with their own eligibility rules. Junior Runners is for ages 8 to 15, Golden Age Runners is for ages 60 and above, while Treadmill Runners Club and Para Runners Club are optional choices available to eligible users.',
      190
    ),
    (
      'How do recurring events work?',
      'Recurring events are events that repeat on a weekly or monthly pattern, such as every Wednesday or a selected weekend of the month. Results are grouped by event date so each occurrence can have its own participants and finishers.',
      200
    ),
    (
      'What is the difference between Finishers and Participants?',
      'Finishers have submitted qualifying activity and met the event conditions, including any minimum daily or cumulative distance requirement. Participants are enrolled or awaiting qualifying results.',
      210
    ),
    (
      'Can smart watch or sports app activity count for events?',
      'Yes, smart watch and other sports app imports can count for events after club or organizer approval. Screenshots or evidence may be required for event credit, but ordinary non-event imports should not be blocked by missing event proof.',
      220
    ),
    (
      'How do I report abusive chat or social content?',
      'Use the report option in Settings or on supported social content. Include a short description and screenshot where available. Admins can review reports, remove offending posts, and flag or ban repeat offenders.',
      230
    ),
    (
      'How does The Running Post magazine work?',
      'The Running Post includes News, Events, Community, Columns, and Gallery content. Event submissions can include a magazine article and photo for review. Admins review magazine content before publication.',
      240
    ),
    (
      'What are the minimum workout recording rules?',
      'A completed GPS workout must meet the current minimum distance and time rules. If it is too short, the app can offer pause and resume where supported. Paused time may appear on the activity result card.',
      250
    ),
    (
      'Can I access events when travelling?',
      'Yes, if you add a travel destination and date range in Profile, the app can show events for both your profile country and travel country during that period.',
      260
    )
) as seed(question, answer, display_order)
where not exists (
  select 1
  from public.faq_entries existing
  where lower(existing.question) = lower(seed.question)
);

commit;
