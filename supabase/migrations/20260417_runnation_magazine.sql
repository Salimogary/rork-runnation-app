begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'magazine',
  'magazine',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.magazine_categories (
  category_id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  color_token text null,
  created_at timestamptz not null default now()
);

create table if not exists public.magazine_issues (
  issue_id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text null,
  description text null,
  editor_note text null,
  cover_image_url text null,
  cover_image_webp_url text null,
  cover_image_avif_url text null,
  volume_number integer not null default 1,
  issue_number integer not null default 1,
  cadence text not null default 'biweekly',
  publication_date date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.magazine_articles (
  article_id uuid primary key default gen_random_uuid(),
  issue_id uuid null references public.magazine_issues(issue_id) on delete set null,
  category_id uuid null references public.magazine_categories(category_id) on delete set null,
  slug text not null unique,
  title text not null,
  subtitle text null,
  summary text null,
  body jsonb not null default '[]'::jsonb,
  author_name text not null,
  author_role text null,
  hero_image_url text null,
  hero_image_webp_url text null,
  hero_image_avif_url text null,
  reading_time_minutes integer not null default 4,
  featured_quote text null,
  is_featured boolean not null default false,
  is_editors_pick boolean not null default false,
  is_published boolean not null default false,
  publish_date date null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.magazine_article_images (
  image_id uuid primary key default gen_random_uuid(),
  article_id uuid null references public.magazine_articles(article_id) on delete cascade,
  purpose text not null default 'inline' check (purpose in ('cover', 'hero', 'inline', 'thumbnail')),
  original_url text not null,
  webp_url text null,
  avif_url text null,
  width integer null,
  height integer null,
  alt_text text null,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  article_id uuid not null references public.magazine_articles(article_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, article_id)
);

create table if not exists public.article_views (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.magazine_articles(article_id) on delete cascade,
  user_id uuid null references public.profiles(id) on delete set null,
  viewed_at timestamptz not null default now()
);

create table if not exists public.magazine_article_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  registration_id text null,
  profile_id uuid null references public.profiles(id) on delete set null,
  author_name text not null,
  email text not null,
  title text not null,
  category text not null,
  pitch text not null,
  body text not null,
  attachment_url text null,
  attachment_name text null,
  attachment_type text null,
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'accepted', 'rejected', 'deleted')),
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.magazine_pictorial_submissions (
  pictorial_id uuid primary key default gen_random_uuid(),
  registration_id text null,
  profile_id uuid null references public.profiles(id) on delete set null,
  submitter_name text not null,
  email text not null,
  club text null,
  country text not null,
  event_name text not null,
  event_date date null,
  caption text not null,
  photo_url text not null,
  photo_webp_url text null,
  photo_avif_url text null,
  photo_path text null,
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'accepted', 'rejected', 'deleted')),
  is_picture_of_week boolean not null default false,
  week_label text null,
  selected_by uuid null references public.profiles(id) on delete set null,
  selected_at timestamptz null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_magazine_articles_issue_id on public.magazine_articles(issue_id);
create index if not exists idx_magazine_articles_category_id on public.magazine_articles(category_id);
create index if not exists idx_magazine_articles_publish_date on public.magazine_articles(publish_date desc);
create index if not exists idx_magazine_submissions_status on public.magazine_article_submissions(status, created_at desc);
create index if not exists idx_magazine_pictorial_submissions_status on public.magazine_pictorial_submissions(status, created_at desc);
create index if not exists idx_magazine_pictorial_picture_of_week on public.magazine_pictorial_submissions(is_picture_of_week, selected_at desc);

insert into public.magazine_categories (name, slug, color_token)
values
  ('Runner Spotlight', 'runner-spotlight', '#FF6B35'),
  ('Club Feature', 'club-feature', '#00C9A7'),
  ('Training', 'training', '#4A90E2'),
  ('Recovery', 'recovery', '#8B5CF6'),
  ('Nutrition', 'nutrition', '#F59E0B'),
  ('Event Preview', 'event-preview', '#EF4444'),
  ('Community Story', 'community-story', '#10B981'),
  ('Gear Pick', 'gear-pick', '#111827')
on conflict (slug) do nothing;

insert into public.magazine_issues (
  issue_id, slug, title, subtitle, description, editor_note, cover_image_url,
  volume_number, issue_number, cadence, publication_date, status
)
values
  ('00000000-0000-0000-0000-000000000301', 'volume-01-issue-03', 'The Belonging Issue', 'Clubs, comeback miles, and the small rituals that keep runners connected.', 'A global look at how ordinary runners build extraordinary consistency through community.', 'This volume is about the quiet power of showing up: the greeting before sunrise, the shared water stop, and the person who waits at the corner so nobody finishes alone.', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=82', 1, 3, 'biweekly', '2026-04-17', 'published'),
  ('00000000-0000-0000-0000-000000000302', 'volume-01-issue-02', 'Stronger Together', 'Training plans, club culture, recovery wisdom, and gear that earns its place.', 'Practical ideas for runners and walkers building momentum without burning out.', 'Progress is rarely loud. It usually looks like a better warm-up, a calmer pace, and friends who keep you honest when motivation dips.', 'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=1400&q=82', 1, 2, 'biweekly', '2026-04-03', 'published'),
  ('00000000-0000-0000-0000-000000000303', 'volume-01-issue-01', 'First Steps, Farther Places', 'Stories from walkers, new runners, and clubs making movement feel welcoming.', 'The launch issue of RunNation Magazine, built around confidence, access, and joy.', 'Every running community begins with a first step. This opening volume celebrates the people who make that step feel possible.', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=82', 1, 1, 'biweekly', '2026-03-20', 'published')
on conflict (slug) do nothing;

insert into public.magazine_articles (
  issue_id, category_id, slug, title, subtitle, summary, body, author_name, author_role,
  hero_image_url, reading_time_minutes, featured_quote, is_featured, is_editors_pick, is_published, publish_date
)
select i.issue_id, c.category_id, seeded.slug, seeded.title, seeded.subtitle, seeded.summary,
  jsonb_build_array(
    jsonb_build_object('type', 'paragraph', 'text', seeded.body_intro),
    jsonb_build_object('type', 'heading', 'text', seeded.body_heading),
    jsonb_build_object('type', 'paragraph', 'text', seeded.body_close)
  ),
  seeded.author_name, seeded.author_role, seeded.hero_image_url, seeded.reading_time_minutes,
  seeded.featured_quote, seeded.is_featured, seeded.is_editors_pick, true, seeded.publish_date::date
from (
  values
    ('volume-01-issue-03','runner-spotlight','the-runner-who-kept-the-corner','The Runner Who Kept the Corner','How one Kampala runner turned a lonely bend into a weekly meeting point.','A short profile of patience, consistency, and the kind of leadership that does not need a microphone.','Before it became a club habit, it was just Joseph standing near the same corner every Saturday.','A Small Ritual With Big Reach','The club now uses the corner as a reset point where faster runners loop back and first-timers learn the route without feeling abandoned.','Maya Okello','RunNation Editorial','https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1400&q=82',5,'Community begins when someone decides the last runner matters as much as the first.',true,true,'2026-04-17'),
    ('volume-01-issue-03','club-feature','nairobi-sunday-easy-crew','Inside Nairobi’s Sunday Easy Crew','A club proving that easy days can be serious community work.','The weekly session has become part movement practice, part check-in, part neighborhood ritual.','The Sunday Easy Crew starts with a rule that sounds almost too gentle: nobody should finish more tired than they arrived.','Why It Works','The route is short, the pace is conversational, and the finish always includes five minutes of stretching.','Daniel Reed','Club Correspondent','https://images.unsplash.com/photo-1502224562085-639556652f33?auto=format&fit=crop&w=1400&q=82',6,'Easy is not lazy. Easy is where people learn how to return.',false,false,'2026-04-17'),
    ('volume-01-issue-03','training','the-two-speed-week','The Two-Speed Week','A practical rhythm for runners who want progress without complicated planning.','One easy session, one stronger session, and enough space between them to stay fresh.','Many new runners do not need a complicated plan. They need a week that is easy to remember and forgiving enough to repeat.','The Useful Contrast','Easy days create room for stronger days, and stronger days give easy days a purpose.','Aisha Morgan','Performance Coach','https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=1400&q=82',4,null,false,false,'2026-04-16'),
    ('volume-01-issue-03','nutrition','breakfast-before-a-long-walk','Breakfast Before a Long Walk','Simple fuel ideas for walkers and runners starting early.','A gentle guide to pre-session meals that are affordable, familiar, and stomach-friendly.','A good pre-walk breakfast does not have to be special. It should be familiar, light enough to move with, and steady enough to last.','Keep It Familiar','Banana with peanut butter, toast with eggs, porridge, fruit and yogurt, or tea with a small sandwich can all work.','Nia Patel','Nutrition Writer','https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1400&q=82',4,'Fuel is not a performance luxury. It is care for the body doing the work.',false,false,'2026-04-15'),
    ('volume-01-issue-02','recovery','the-rest-day-that-still-counts','The Rest Day That Still Counts','Why recovery is not a break from progress but part of the plan.','A calm reminder that adaptation happens when the body gets time to absorb the work.','A rest day can feel strange when you are excited about progress. But the body becomes stronger when it repairs.','Recovery Is Training','The goal is not to do nothing forever. The goal is to return with enough freshness to enjoy the next session.','Leah Mensah','Wellness Editor','https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1400&q=82',4,'Rest is not falling behind. Rest is where the training becomes yours.',true,false,'2026-04-03'),
    ('volume-01-issue-02','gear-pick','the-light-jacket-test','The Light Jacket Test','How to choose a layer that helps more than it annoys.','A practical gear note for changing weather, morning starts, and travel runs.','A good light jacket should disappear once you start moving. If it traps too much heat, it may not earn its space.','Three Things To Check','Look for breathable fabric, useful pocket security, and visibility if you move before sunrise.','Owen Hart','Gear Notes','https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=82',3,null,false,false,'2026-04-02'),
    ('volume-01-issue-02','community-story','walking-group-that-became-a-club','The Walking Group That Became a Club','A community story about starting with conversation and growing into structure.','How a small group used consistency, not speed, to create a durable local club.','The group did not call itself a club at first. It was three neighbors meeting after work because walking alone felt easy to cancel.','Belonging Before Structure','By month six, new people were asking where to register, and the group had become part of the neighborhood rhythm.','Fatima Noor','Community Writer','https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=1400&q=82',5,'Structure arrived after belonging, not before it.',false,false,'2026-04-01'),
    ('volume-01-issue-02','training','hills-without-fear','Hills Without Fear','A beginner-friendly way to make climbing part of your week.','Short hills can improve strength and confidence when approached patiently.','Hills become less intimidating when you stop treating them like tests. Think of them as strength practice.','Climb With Control','Keep your steps short, look slightly ahead, and walk early if your breathing spikes.','Sam Rivera','Coach','https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=82',4,null,false,false,'2026-03-31'),
    ('volume-01-issue-01','runner-spotlight','first-5k-first-finish-line','First 5K, First Finish Line','A new runner’s account of turning nerves into a finish-line smile.','An honest, encouraging story for anyone preparing for a first event.','The night before her first 5K, Amara laid out her shoes, pinned her bib twice, and still wondered if everyone else knew what they were doing.','The Finish Line Moment','At the finish, she did not check her time first. She looked back for the friend who started beside her.','RunNation Editorial','Spotlight Desk','https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1400&q=82',5,'The medal mattered. The memory mattered more.',true,false,'2026-03-20'),
    ('volume-01-issue-01','club-feature','how-to-welcome-new-members','How Clubs Can Welcome New Members','Five small gestures that make a first session less intimidating.','A practical club culture guide for coordinators and friendly regulars.','A new member decides quickly whether a club feels safe. The route matters, but the welcome matters more.','Make The First Ten Minutes Count','Say names slowly, explain the route before moving, and make the slowest option visible.','Clara James','Club Culture','https://images.unsplash.com/photo-1520975682031-a2cfe6aeba80?auto=format&fit=crop&w=1400&q=82',4,null,false,false,'2026-03-19'),
    ('volume-01-issue-01','community-story','from-solo-miles-to-shared-routes','From Solo Miles to Shared Routes','Why many runners stay consistent once they stop doing everything alone.','A community-centered reflection on accountability, friendship, and showing up.','Solo miles can be peaceful. Shared routes can be sustaining. Community gives your intention somewhere to land.','Accountability Can Feel Gentle','When someone expects you at the start, the decision to move becomes easier.','Mika Tan','Community Desk','https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=82',5,null,false,false,'2026-03-18'),
    ('volume-01-issue-01','event-preview','how-to-choose-your-first-event','How to Choose Your First Event','A calm checklist for picking a race or walk that fits your life.','The right first event should feel exciting, realistic, and welcoming.','Your first event does not need to be the biggest one. It needs to be the one that helps you arrive prepared and leave proud.','Choose For Confidence','Look for a friendly distance, clear route support, and a start time that does not add stress.','RunNation Events','Events Team','https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1400&q=82',4,null,false,false,'2026-03-17')
) as seeded(issue_slug, category_slug, slug, title, subtitle, summary, body_intro, body_heading, body_close, author_name, author_role, hero_image_url, reading_time_minutes, featured_quote, is_featured, is_editors_pick, publish_date)
join public.magazine_issues i on i.slug = seeded.issue_slug
join public.magazine_categories c on c.slug = seeded.category_slug
on conflict (slug) do nothing;

alter table public.magazine_categories enable row level security;
alter table public.magazine_issues enable row level security;
alter table public.magazine_articles enable row level security;
alter table public.magazine_article_images enable row level security;
alter table public.saved_articles enable row level security;
alter table public.article_views enable row level security;
alter table public.magazine_article_submissions enable row level security;
alter table public.magazine_pictorial_submissions enable row level security;

drop policy if exists "magazine_categories_read" on public.magazine_categories;
create policy "magazine_categories_read" on public.magazine_categories for select using (true);

drop policy if exists "magazine_issues_read_published" on public.magazine_issues;
create policy "magazine_issues_read_published" on public.magazine_issues for select using (status = 'published');

drop policy if exists "magazine_articles_read_published" on public.magazine_articles;
create policy "magazine_articles_read_published" on public.magazine_articles for select using (is_published = true);

drop policy if exists "magazine_article_images_read" on public.magazine_article_images;
create policy "magazine_article_images_read" on public.magazine_article_images for select using (true);

drop policy if exists "saved_articles_own" on public.saved_articles;
create policy "saved_articles_own" on public.saved_articles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "article_views_insert_any_auth" on public.article_views;
create policy "article_views_insert_any_auth" on public.article_views for insert with check (auth.uid() is null or user_id = auth.uid());

drop policy if exists "magazine_submissions_insert_auth" on public.magazine_article_submissions;
create policy "magazine_submissions_insert_auth" on public.magazine_article_submissions for insert with check (auth.uid() is not null);

drop policy if exists "magazine_submissions_admin_read" on public.magazine_article_submissions;
create policy "magazine_submissions_admin_read" on public.magazine_article_submissions for select using (
  public.is_super_admin(auth.uid()) or public.is_country_admin(auth.uid(), null::text)
);

drop policy if exists "magazine_submissions_super_admin_delete" on public.magazine_article_submissions;
create policy "magazine_submissions_super_admin_delete" on public.magazine_article_submissions for delete using (
  public.is_super_admin(auth.uid())
);

drop policy if exists "magazine_pictorials_read_accepted" on public.magazine_pictorial_submissions;
create policy "magazine_pictorials_read_accepted" on public.magazine_pictorial_submissions for select using (
  status = 'accepted' or public.is_super_admin(auth.uid()) or public.is_country_admin(auth.uid(), null::text)
);

drop policy if exists "magazine_pictorials_insert_auth" on public.magazine_pictorial_submissions;
create policy "magazine_pictorials_insert_auth" on public.magazine_pictorial_submissions for insert with check (auth.uid() is not null);

drop policy if exists "magazine_pictorials_super_admin_delete" on public.magazine_pictorial_submissions;
create policy "magazine_pictorials_super_admin_delete" on public.magazine_pictorial_submissions for delete using (
  public.is_super_admin(auth.uid())
);

commit;
