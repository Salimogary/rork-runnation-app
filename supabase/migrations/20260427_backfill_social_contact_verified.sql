begin;

update public.contacts c
set em_verified = true
from public.profiles p
join auth.users u on u.id = p.id
where p.legacy_registration_id = c.registration_id
  and coalesce(c.em_verified, false) = false
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
