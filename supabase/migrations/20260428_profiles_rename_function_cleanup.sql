begin;

create or replace function public.current_registration_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.registration_id::text
  from public.profiles p
  where p.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.handle_new_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    profile_id,
    username,
    display_name,
    avatar_url
  )
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), new.id::text)),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_profile();

create or replace function public.sync_profile_country_code_from_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country_code text;
begin
  v_country_code := public.resolve_country_iso_alpha2(new.country);

  update public.profiles
     set country_code = v_country_code
   where registration_id = new.registration_id
     and country_code is distinct from v_country_code;

  return new;
end;
$$;

create or replace function public.sync_profile_country_code_from_profile_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text;
begin
  if new.registration_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.registration_id is not distinct from old.registration_id
     and new.country_code is not null then
    return new;
  end if;

  select r.country
    into v_country
  from public.registrations r
  where r.registration_id = new.registration_id;

  new.country_code := public.resolve_country_iso_alpha2(v_country);
  return new;
end;
$$;

drop trigger if exists profiles_sync_country_code_from_registration_link on public.profiles;

create trigger profiles_sync_country_code_from_registration_link
  before insert or update of registration_id on public.profiles
  for each row
  execute function public.sync_profile_country_code_from_profile_link();

update public.profiles p
   set country_code = public.resolve_country_iso_alpha2(r.country)
  from public.registrations r
 where p.registration_id = r.registration_id
   and p.country_code is distinct from public.resolve_country_iso_alpha2(r.country);

create or replace function public.resolve_profile_id_for_role_assignment(
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select p.profile_id
  into v_profile_id
  from public.profiles p
  join auth.users au on au.id = p.profile_id
  where lower(au.email) = lower(trim(p_email))
  limit 1;

  if v_profile_id is not null then
    return v_profile_id;
  end if;

  select p.profile_id
  into v_profile_id
  from public.profiles p
  where lower(p.username) = lower(trim(p_email))
  limit 1;

  if v_profile_id is null then
    raise exception 'No profile found for "%" (expected auth email or profile username).', p_email;
  end if;

  return v_profile_id;
end;
$$;

commit;
