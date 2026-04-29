begin;

insert into public.faq_entries (question, answer, display_order, is_active)
select *
from (
  values
    (
      'How do I edit my profile details?',
      'Open Profile to update your personal details, country, photo, goals, and other account information. Keeping your profile current helps the app match you to the right events and community views.',
      90,
      true
    ),
    (
      'Why is my email verification important?',
      'A verified email helps with account recovery, trust, and profile completion. If you signed in with Google or Apple, the app may already recognise that email as verified.',
      100,
      true
    ),
    (
      'What happens after I submit an external activity?',
      'External activities go into a review flow so an admin can confirm the submission before it appears in your main activity records.',
      110,
      true
    ),
    (
      'How do club requests work?',
      'When you request to join a club, the request goes to the relevant admin or coordinator for review. You should see the club reflected in your account once the request is approved.',
      120,
      true
    ),
    (
      'Why is an event marked view only?',
      'An event may be view only if it is outside your registered country and is not virtual, or if the app is showing it for visibility but not for direct enrollment.',
      130,
      true
    ),
    (
      'How do medals work for events?',
      'Some events include medal tracking. When that happens, the event may define daily or cumulative distance targets and a medal date range that determine who qualifies.',
      140,
      true
    ),
    (
      'Can I change my country later?',
      'Yes, but changing country can affect local events, club matching, shop availability, and admin contact suggestions. It is best to keep it aligned with where you actually participate.',
      150,
      true
    ),
    (
      'Where do I find support if something looks wrong?',
      'Start with Settings > Help for admin contacts, then use Suggestions if you want to report a bug, ask for a feature, or explain a support issue in more detail.',
      160,
      true
    )
) as seed(question, answer, display_order, is_active)
where not exists (
  select 1
  from public.faq_entries existing
  where lower(existing.question) = lower(seed.question)
);

commit;
