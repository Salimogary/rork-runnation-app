create table if not exists public.live_magazine (
  article_id uuid primary key default gen_random_uuid(),
  registration_id text null,
  page text not null check (page in ('News', 'Events', 'Community', 'Columns', 'Gallery')),
  author text not null,
  article_date date not null default current_date,
  title text not null,
  body text not null,
  picture_link text null,
  external_link text null,
  source_table text null,
  source_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.magazine_article_submissions
  add column if not exists external_link text null;

create index if not exists idx_live_magazine_page_date
  on public.live_magazine(page, article_date desc, created_at desc);

create unique index if not exists idx_live_magazine_source
  on public.live_magazine(source_table, source_id)
  where source_table is not null and source_id is not null;

alter table public.live_magazine enable row level security;

drop policy if exists "live_magazine_read" on public.live_magazine;
create policy "live_magazine_read" on public.live_magazine
  for select using (true);

drop policy if exists "live_magazine_admin_insert" on public.live_magazine;
create policy "live_magazine_admin_insert" on public.live_magazine
  for insert with check (
    public.is_super_admin(auth.uid())
    or public.is_country_admin(auth.uid(), null::text)
    or public.is_country_coordinator(auth.uid(), null::text)
    or public.is_club_coordinator(auth.uid(), null::uuid)
  );

drop policy if exists "live_magazine_admin_update" on public.live_magazine;
create policy "live_magazine_admin_update" on public.live_magazine
  for update using (
    public.is_super_admin(auth.uid())
    or public.is_country_admin(auth.uid(), null::text)
    or public.is_country_coordinator(auth.uid(), null::text)
    or public.is_club_coordinator(auth.uid(), null::uuid)
  )
  with check (
    public.is_super_admin(auth.uid())
    or public.is_country_admin(auth.uid(), null::text)
    or public.is_country_coordinator(auth.uid(), null::text)
    or public.is_club_coordinator(auth.uid(), null::uuid)
  );

drop policy if exists "live_magazine_admin_delete" on public.live_magazine;
create policy "live_magazine_admin_delete" on public.live_magazine
  for delete using (
    public.is_super_admin(auth.uid())
    or public.is_country_admin(auth.uid(), null::text)
    or public.is_country_coordinator(auth.uid(), null::text)
    or public.is_club_coordinator(auth.uid(), null::uuid)
  );
