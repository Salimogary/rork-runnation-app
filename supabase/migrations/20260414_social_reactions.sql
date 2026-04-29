create table if not exists public.social_post_reactions (
  reaction_id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null references public.social_posts(social_post_id) on delete cascade,
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint unique_social_post_reaction unique (social_post_id, registration_id)
);

create index if not exists idx_social_post_reactions_post
on public.social_post_reactions (social_post_id);

create table if not exists public.social_comment_reactions (
  reaction_id uuid primary key default gen_random_uuid(),
  social_comment_id uuid not null references public.social_comments(comment_id) on delete cascade,
  registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint unique_social_comment_reaction unique (social_comment_id, registration_id)
);

create index if not exists idx_social_comment_reactions_comment
on public.social_comment_reactions (social_comment_id);
