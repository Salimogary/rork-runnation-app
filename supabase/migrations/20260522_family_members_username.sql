alter table public.family_members
add column if not exists member_username text null;

alter table public.family_members
alter column member_email drop not null;

create index if not exists idx_family_members_member_username
on public.family_members (member_username);
