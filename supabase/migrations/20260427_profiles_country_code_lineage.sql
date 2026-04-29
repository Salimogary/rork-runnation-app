begin;

create or replace function public.resolve_country_iso_alpha2(p_country text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_country text;
  v_code text;
begin
  v_country := nullif(trim(p_country), '');

  if v_country is null then
    return null;
  end if;

  if length(v_country) = 2 then
    select c.iso_alpha2
      into v_code
    from public.countries c
    where upper(c.iso_alpha2) = upper(v_country)
    limit 1;

    if v_code is not null then
      return upper(v_code);
    end if;
  end if;

  select c.iso_alpha2
    into v_code
  from public.countries c
  where lower(c.name) = lower(v_country)
  limit 1;

  if v_code is not null then
    return upper(v_code);
  end if;

  return case when length(v_country) = 2 then upper(v_country) else null end;
end;
$$;

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
   where legacy_registration_id = new.registration_id
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
  if new.legacy_registration_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.legacy_registration_id is not distinct from old.legacy_registration_id
     and new.country_code is not null then
    return new;
  end if;

  select r.country
    into v_country
  from public.registrations r
  where r.registration_id = new.legacy_registration_id;

  new.country_code := public.resolve_country_iso_alpha2(v_country);
  return new;
end;
$$;

drop trigger if exists registrations_sync_profile_country_code on public.registrations;

create trigger registrations_sync_profile_country_code
  after insert or update of country on public.registrations
  for each row
  execute function public.sync_profile_country_code_from_registration();

drop trigger if exists profiles_sync_country_code_from_registration_link on public.profiles;

create trigger profiles_sync_country_code_from_registration_link
  before insert or update of legacy_registration_id on public.profiles
  for each row
  execute function public.sync_profile_country_code_from_profile_link();

update public.profiles p
   set country_code = public.resolve_country_iso_alpha2(r.country)
  from public.registrations r
 where p.legacy_registration_id = r.registration_id
   and p.country_code is distinct from public.resolve_country_iso_alpha2(r.country);

comment on function public.resolve_country_iso_alpha2(text) is
  'Normalizes a registration country value into the countries.iso_alpha2 code.';

commit;
