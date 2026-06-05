begin;

insert into public.app_settings (key, value, description, updated_at)
values
  (
    'android_apk_build_number',
    '1',
    'Latest Android APK build number. Increase this when publishing a newer APK for testers.',
    now()
  ),
  (
    'ios_build_number',
    '0',
    'Latest iOS TestFlight/App Store build number. Keep 0 while iOS is coming soon.',
    now()
  )
on conflict (key) do update
set
  description = excluded.description,
  updated_at = public.app_settings.updated_at;

commit;
