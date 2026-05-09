insert into storage.buckets (id, name, public)
values ('chat_report_screenshots', 'chat_report_screenshots', false)
on conflict (id) do nothing;

create table if not exists public.user_moderation_flags (
  registration_id uuid primary key references public.registrations(registration_id) on delete cascade,
  confirmed_flags integer not null default 0,
  dismissed_reports integer not null default 0,
  is_banned boolean not null default false,
  banned_at timestamptz null,
  banned_by uuid null references auth.users(id) on delete set null,
  ban_reason text null,
  last_reported_at timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_moderation_reports (
  report_id uuid primary key default gen_random_uuid(),
  reporter_registration_id uuid not null references public.registrations(registration_id) on delete cascade,
  reported_registration_id uuid null references public.registrations(registration_id) on delete set null,
  social_post_id uuid null references public.social_posts(social_post_id) on delete set null,
  comment_id uuid null references public.social_comments(comment_id) on delete set null,
  reason_category text not null default 'abuse',
  description text not null,
  screenshot_path text null,
  status text not null default 'pending',
  admin_notes text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint chat_moderation_reports_status_check check (status in ('pending', 'content_removed', 'dismissed', 'user_banned')),
  constraint chat_moderation_reports_reason_check check (
    reason_category in ('abuse', 'hate', 'disrespect', 'divisive', 'sectarian', 'pornographic', 'spam', 'other')
  )
);

create index if not exists idx_chat_moderation_reports_status
  on public.chat_moderation_reports (status, created_at desc);

create index if not exists idx_chat_moderation_reports_reported_user
  on public.chat_moderation_reports (reported_registration_id, created_at desc)
  where reported_registration_id is not null;

create index if not exists idx_user_moderation_flags_banned
  on public.user_moderation_flags (is_banned)
  where is_banned = true;
