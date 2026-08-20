begin;

alter table public.catalogue
  add column if not exists condition text not null default 'New';

alter table public.catalogue
  drop constraint if exists catalogue_condition_check,
  add constraint catalogue_condition_check
  check (condition in ('New', 'Used', 'Refurbished'));

comment on column public.catalogue.condition is
  'Merchandise condition: New, Used, or Refurbished.';

commit;
