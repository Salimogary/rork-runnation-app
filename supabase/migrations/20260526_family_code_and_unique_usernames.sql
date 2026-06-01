create extension if not exists pgcrypto;

create or replace function public.generate_family_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'RN-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (
      select 1
      from public.registrations
      where family_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

alter table public.registrations
add column if not exists family_code text;

update public.registrations
set family_code = public.generate_family_code()
where family_code is null or trim(family_code) = '';

alter table public.registrations
alter column family_code set not null;

alter table public.registrations
alter column family_code set default public.generate_family_code();

create unique index if not exists registrations_family_code_unique
on public.registrations (family_code);

create unique index if not exists registrations_username_lower_unique
on public.registrations (lower(username))
where username is not null;

create unique index if not exists profiles_username_lower_unique
on public.profiles (lower(username))
where username is not null;

create index if not exists idx_family_members_owner_member
on public.family_members (owner_registration_id, member_registration_id);
