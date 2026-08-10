update public.event_accommodation_offers
set accommodation_type = 'single'
where accommodation_type = 'lone';

alter table public.event_accommodation_offers
  drop constraint if exists event_accommodation_type_check;

alter table public.event_accommodation_offers
  add constraint event_accommodation_type_check
  check (accommodation_type in ('single', 'shared', 'mixed'));
