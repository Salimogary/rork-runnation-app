begin;

update public.registrations r
set email_verified = true
from public.profiles p
join auth.users u on u.id = p.id
where p.legacy_registration_id = r.registration_id
  and coalesce(r.email_verified, false) = false
  and (
    coalesce(u.app_metadata ->> 'provider', '') in ('google', 'apple')
    or exists (
      select 1
      from auth.identities i
      where i.user_id = u.id
        and i.provider in ('google', 'apple')
    )
  );

commit;
