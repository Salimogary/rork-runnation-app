# RunNation QA Data Toolkit

This folder gives you a practical way to test most of the app with coherent demo data instead of stale production leftovers.

## Files

- [20260425_reset_demo_seed.sql](C:/Users/salim/rork-runnation-app/supabase/seeds/20260425_reset_demo_seed.sql)
  Removes only the deterministic demo rows created by the seed file.
- [20260425_seed_demo_data.sql](C:/Users/salim/rork-runnation-app/supabase/seeds/20260425_seed_demo_data.sql)
  Inserts realistic QA data for the currently active app tables.
- [20260425_full_dynamic_wipe.sql](C:/Users/salim/rork-runnation-app/supabase/seeds/20260425_full_dynamic_wipe.sql)
  Destructive reset for a disposable dev or staging database.
- [../docs/table-retention-review.md](C:/Users/salim/rork-runnation-app/supabase/docs/table-retention-review.md)
  Keep/delete guidance based on the current codebase.

## Safe order

For a shared dev database:

1. Run `20260425_reset_demo_seed.sql`
2. Run `20260425_seed_demo_data.sql`

For a disposable staging database where you want a near-clean slate:

1. Run `20260425_full_dynamic_wipe.sql`
2. Run `20260425_seed_demo_data.sql`

## Important notes

1. The seed uses deterministic UUIDs and usernames prefixed with `qa_` so cleanup is predictable.
2. `profiles` rows are inserted only when matching `auth.users` rows already exist, because `profiles.id` references `auth.users(id)`.
3. This means the seed covers frontend display and backend workflows even if you have not created matching auth users yet, but admin role-session testing is best when you also have real auth users linked to the seeded registrations.
4. The script intentionally does **not** delete `countries`, `roles`, or the published magazine issue/article content shipped in migrations.

## Suggested auth setup for fuller testing

If you want loginable QA users, create a few auth users in Supabase Auth and then update their `profiles.legacy_registration_id` to one of the seeded registrations:

- `00000000-0000-0000-0000-000000000101` - Uganda Global Admin style dataset
- `00000000-0000-0000-0000-000000000102` - Uganda runner
- `00000000-0000-0000-0000-000000000103` - Kenya coordinator dataset
- `00000000-0000-0000-0000-000000000104` - Kenya runner
- `00000000-0000-0000-0000-000000000105` - no-club runner

Then, if you want admin-role testing, assign roles in `user_role_assignments` for those linked profiles.
