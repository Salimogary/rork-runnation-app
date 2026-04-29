begin;

alter table public.events
add column if not exists club text null,
add column if not exists poster_link text null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event_poster',
  'event_poster',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
