alter table if exists public.magazine_article_submissions
  add column if not exists event_id text null,
  add column if not exists article_writer_name text null,
  add column if not exists magazine_photo_url text null,
  add column if not exists attachment_url text null;

create index if not exists idx_magazine_submissions_event_id
  on public.magazine_article_submissions(event_id);

update public.magazine_article_submissions
set article_writer_name = coalesce(article_writer_name, author_name)
where article_writer_name is null;

update public.magazine_article_submissions
set event_id = regexp_replace(attachment_name, '-(event|magazine)-picture$', '')
where event_id is null
  and attachment_name ~ '^E[0-9]+-(event|magazine)-picture$';
