alter table public.live_magazine
  drop constraint if exists live_magazine_page_check;

alter table public.live_magazine
  add constraint live_magazine_page_check
  check (page in ('News', 'Events', 'Community', 'Columns', 'Gallery'));
