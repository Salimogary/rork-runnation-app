-- RunNation Magazine issue copy-paste template
-- How to use:
-- 1. Upload your cover, article, and gallery pictures into Supabase Storage.
-- 2. Copy their public URLs.
-- 3. Replace the values marked EDIT below.
-- 4. Run this whole script in Supabase SQL Editor.
-- 5. In the app, pull-to-refresh the Magazine tab.

begin;

-- EDIT: latest issue details.
with upsert_issue as (
  insert into public.magazine_issues (
    slug,
    title,
    subtitle,
    description,
    editor_note,
    cover_image_url,
    volume_number,
    issue_number,
    cadence,
    publication_date,
    status
  )
  values (
    'volume-01-issue-04',
    'EDIT ISSUE TITLE',
    'EDIT short cover subtitle.',
    'EDIT one-sentence issue description.',
    'EDIT editor note shown inside the issue page.',
    'https://EDIT-COVER-IMAGE-URL',
    1,
    4,
    'biweekly',
    '2026-05-01',
    'published'
  )
  on conflict (slug) do update
  set title = excluded.title,
      subtitle = excluded.subtitle,
      description = excluded.description,
      editor_note = excluded.editor_note,
      cover_image_url = excluded.cover_image_url,
      volume_number = excluded.volume_number,
      issue_number = excluded.issue_number,
      cadence = excluded.cadence,
      publication_date = excluded.publication_date,
      status = excluded.status
  returning issue_id, slug
),
required_categories as (
  insert into public.magazine_categories (name, slug, color_token)
  values
    ('Runner Spotlight', 'runner-spotlight', '#FF6B35'),
    ('Club Feature', 'club-feature', '#00C9A7'),
    ('Community Story', 'community-story', '#10B981'),
    ('Fitness Coach Column', 'fitness-coach', '#2563EB'),
    ('Upcoming Event', 'event-preview', '#EF4444'),
    ('Event Review', 'event-review', '#B91C1C'),
    ('Gear Pick', 'gear-pick', '#111827')
  on conflict (slug) do update
  set name = excluded.name,
      color_token = excluded.color_token
  returning category_id, slug
)
insert into public.magazine_articles (
  issue_id,
  category_id,
  slug,
  title,
  subtitle,
  summary,
  body,
  author_name,
  author_role,
  hero_image_url,
  reading_time_minutes,
  featured_quote,
  is_featured,
  is_editors_pick,
  is_published,
  publish_date
)
select
  issue.issue_id,
  category.category_id,
  article.slug,
  article.title,
  article.subtitle,
  article.summary,
  article.body::jsonb,
  article.author_name,
  article.author_role,
  article.hero_image_url,
  article.reading_time_minutes,
  article.featured_quote,
  article.is_featured,
  article.is_editors_pick,
  true,
  article.publish_date::date
from upsert_issue issue
join (
  values
    -- Runner Spotlight, 2 articles.
    ('runner-spotlight', 'runner-spotlight-01', 'EDIT Runner Spotlight 1 title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT paragraph one."},{"type":"paragraph","text":"EDIT paragraph two."}]', 'EDIT Author', 'Runner Spotlight', 'https://EDIT-IMAGE-URL', 4, null, true, true, '2026-05-01'),
    ('runner-spotlight', 'runner-spotlight-02', 'EDIT Runner Spotlight 2 title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT paragraph one."},{"type":"quote","text":"EDIT optional quote."}]', 'EDIT Author', 'Runner Spotlight', 'https://EDIT-IMAGE-URL', 4, null, false, false, '2026-05-01'),

    -- Club Feature, 2 articles.
    ('club-feature', 'club-feature-01', 'EDIT Club Feature 1 title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT paragraph one."},{"type":"heading","text":"EDIT heading"},{"type":"paragraph","text":"EDIT paragraph two."}]', 'EDIT Author', 'Club Correspondent', 'https://EDIT-IMAGE-URL', 5, null, false, false, '2026-05-01'),
    ('club-feature', 'club-feature-02', 'EDIT Club Feature 2 title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT paragraph one."},{"type":"bullets","items":["EDIT point one","EDIT point two"]}]', 'EDIT Author', 'Club Correspondent', 'https://EDIT-IMAGE-URL', 5, null, false, false, '2026-05-01'),

    -- Community Story, 2 submitted-user picks.
    ('community-story', 'community-story-01', 'EDIT Community Story 1 title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT submitted story paragraph."}]', 'Submitted by EDIT NAME', 'Community Submission', 'https://EDIT-IMAGE-URL', 4, null, false, false, '2026-05-01'),
    ('community-story', 'community-story-02', 'EDIT Community Story 2 title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT submitted story paragraph."}]', 'Submitted by EDIT NAME', 'Community Submission', 'https://EDIT-IMAGE-URL', 4, null, false, false, '2026-05-01'),

    -- Fitness Coach Column, 1 article.
    ('fitness-coach', 'fitness-coach-column-01', 'EDIT Fitness Coach Column title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT coach advice."},{"type":"bullets","items":["EDIT coaching point one","EDIT coaching point two"]}]', 'EDIT Coach Name', 'Fitness Coach', 'https://EDIT-IMAGE-URL', 5, null, false, false, '2026-05-01'),

    -- Events, 1 upcoming preview and 1 concluded event review.
    ('event-preview', 'upcoming-event-01', 'EDIT Upcoming Event title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT what users should expect."}]', 'RunNation Events', 'Events Team', 'https://EDIT-IMAGE-URL', 4, null, false, false, '2026-05-01'),
    ('event-review', 'event-review-01', 'EDIT Concluded Event Review title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT what happened."},{"type":"bullets","items":["EDIT highlight one","EDIT highlight two"]}]', 'RunNation Events', 'Events Team', 'https://EDIT-IMAGE-URL', 4, null, false, false, '2026-05-01'),

    -- Gear Pick, 1 article.
    ('gear-pick', 'gear-pick-01', 'EDIT Gear Pick title', 'EDIT subtitle', 'EDIT summary.', '[{"type":"paragraph","text":"EDIT gear note."},{"type":"bullets","items":["EDIT buying/use point one","EDIT buying/use point two"]}]', 'RunNation Gear Desk', 'Gear Pick', 'https://EDIT-IMAGE-URL', 3, null, false, false, '2026-05-01')
) as article(category_slug, slug, title, subtitle, summary, body, author_name, author_role, hero_image_url, reading_time_minutes, featured_quote, is_featured, is_editors_pick, publish_date)
join public.magazine_categories category on category.slug = article.category_slug
on conflict (slug) do update
set title = excluded.title,
    subtitle = excluded.subtitle,
    summary = excluded.summary,
    body = excluded.body,
    author_name = excluded.author_name,
    author_role = excluded.author_role,
    hero_image_url = excluded.hero_image_url,
    reading_time_minutes = excluded.reading_time_minutes,
    featured_quote = excluded.featured_quote,
    is_featured = excluded.is_featured,
    is_editors_pick = excluded.is_editors_pick,
    is_published = excluded.is_published,
    publish_date = excluded.publish_date;

-- Optional: insert approved gallery photos directly.
-- EDIT or duplicate rows below. The selected Picture of the Week becomes the Magazine cover background in the app.
insert into public.magazine_pictorial_submissions (
  submitter_name,
  email,
  club,
  country,
  event_name,
  event_date,
  caption,
  photo_url,
  status,
  is_picture_of_week,
  week_label,
  selected_at
)
values
  ('RunNation Editorial', 'editor@runnation.app', 'EDIT CLUB', 'EDIT COUNTRY', 'EDIT EVENT NAME', '2026-05-01', 'EDIT caption for picture of the week.', 'https://EDIT-PICTURE-OF-WEEK-URL', 'accepted', true, '2026-W18', now()),
  ('RunNation Editorial', 'editor@runnation.app', 'EDIT CLUB', 'EDIT COUNTRY', 'EDIT EVENT NAME', '2026-05-01', 'EDIT approved gallery caption.', 'https://EDIT-GALLERY-IMAGE-URL', 'accepted', false, null, null);

commit;
