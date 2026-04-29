insert into public.magazine_categories (name, slug, color_token)
values
  ('Fitness Coach Column', 'fitness-coach', '#2563EB'),
  ('Event Review', 'event-review', '#B91C1C')
on conflict (slug) do update
set name = excluded.name,
    color_token = excluded.color_token;

update public.magazine_categories
set name = 'Upcoming Event'
where slug = 'event-preview';
