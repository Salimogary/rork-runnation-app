begin;

insert into public.app_settings (key, value, description, updated_at)
values (
  'android_apk_url',
  'https://drive.google.com/file/d/1bAThGh2w8YR69wHKdmJwGtC5HAZfySkB/view?usp=drive_link',
  'Current RunNation Android APK share link.',
  now()
)
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read"
  on public.app_settings
  for select
  using (key in ('android_apk_url', 'android_apk_build_number', 'ios_app_url', 'ios_build_number'));

commit;
