begin;

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
  on public.app_settings
  for select
  using (key in ('android_apk_url', 'ios_app_url'));

insert into public.app_settings (key, value, description, updated_at)
values (
  'android_apk_url',
  'https://expo.dev/artifacts/eas/27LbCHM76M74izfEPYt1pN.apk',
  'Current RunNation Android APK share link.',
  now()
)
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

insert into public.app_settings (key, value, description, updated_at)
values (
  'ios_app_url',
  '',
  'Current RunNation iOS share link. Leave blank while TestFlight/App Store is coming soon.',
  now()
)
on conflict (key) do nothing;

commit;
