begin;

alter table public.contacts
  alter column phone type bigint;

commit;
