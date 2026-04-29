begin;

alter table public.catalogue
  add column if not exists country_code text not null default 'UG',
  add column if not exists currency_code text not null default 'UGX';

alter table public.events
  add column if not exists country text null,
  add column if not exists country_code text null,
  add column if not exists is_virtual boolean not null default false;

update public.catalogue
set country_code = 'UG',
    currency_code = 'UGX'
where country_code is null
   or currency_code is null;

update public.events
set country = coalesce(country, 'Uganda'),
    country_code = coalesce(country_code, 'UG')
where country is null
   or country_code is null;

create index if not exists idx_catalogue_country_code on public.catalogue(country_code);
create index if not exists idx_events_country_virtual on public.events(country_code, is_virtual, starts_at desc);

commit;
