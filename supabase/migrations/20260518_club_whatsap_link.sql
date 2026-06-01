begin;

create extension if not exists pgcrypto;

create table if not exists public.club_whatsap_link (
  link_id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(club_id) on delete cascade,
  club_name text not null,
  link text not null,
  constraint club_whatsap_link_unique_club unique (club_id),
  constraint club_whatsap_link_url_check check (link ~* '^https?://')
);

create index if not exists idx_club_whatsap_link_club_id
  on public.club_whatsap_link (club_id);

comment on table public.club_whatsap_link is
  'Coordinator-managed WhatsApp group links shown to club members in their profile.';

commit;
