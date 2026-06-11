create table if not exists public.club_member_directory (
  member_id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(club_id) on delete cascade,
  name text not null,
  nickname text,
  phone text,
  normalized_phone text,
  email text,
  normalized_email text,
  linked_registration_id uuid references public.registrations(registration_id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_member_directory_contact_required
    check (normalized_phone is not null or normalized_email is not null)
);

create unique index if not exists club_member_directory_phone_unique
  on public.club_member_directory (club_id, normalized_phone)
  where normalized_phone is not null;

create unique index if not exists club_member_directory_email_unique
  on public.club_member_directory (club_id, normalized_email)
  where normalized_email is not null;

create index if not exists club_member_directory_registration_idx
  on public.club_member_directory (linked_registration_id);

alter table public.club_member_directory enable row level security;

revoke all on public.club_member_directory from anon, authenticated;
grant all on public.club_member_directory to service_role;
