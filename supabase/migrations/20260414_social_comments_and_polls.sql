alter table public.social_posts
add column if not exists poll_question text,
add column if not exists poll_options jsonb;

create table if not exists public.social_comments (
  comment_id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null references public.social_posts(social_post_id) on delete cascade,
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_comments_post_id
on public.social_comments (social_post_id, created_at desc);

create table if not exists public.social_poll_votes (
  vote_id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null references public.social_posts(social_post_id) on delete cascade,
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  option_index integer not null,
  created_at timestamptz not null default now(),
  constraint unique_social_poll_vote unique (social_post_id, registration_id)
);

create index if not exists idx_social_poll_votes_post_id
on public.social_poll_votes (social_post_id);

create table if not exists public.social_mentions (
  mention_id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null references public.social_posts(social_post_id) on delete cascade,
  social_comment_id uuid null references public.social_comments(comment_id) on delete cascade,
  mentioned_registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  mentioned_by_registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_mentions_target
on public.social_mentions (mentioned_registration_id, is_read, created_at desc);
