# RunNation App Documentation

RunNation is an Expo Router and React Native app for runners, walkers, clubs, events, magazine content, shop orders, community chat, goals, and admin operations. It uses Supabase for auth, data, storage, and migrations, with a TypeScript backend layer exposing tRPC routes.

## Core Stack

- App: Expo SDK 54, React Native 0.81, Expo Router, TypeScript.
- Server state: React Query and tRPC client.
- Backend: Hono/tRPC routes under `backend/trpc`, plus Express server files for standalone API hosting.
- Database and storage: Supabase, with migrations in `supabase/migrations`.
- UI: React Native components, Lucide icons, Expo image/location/speech/sharing modules.
- Package managers: Bun is used by the Rork scripts; `package-lock.json` is also present for npm-based installs.

## Main App Areas

- `app/(tabs)/index.tsx`: Exercise screen. Handles GPS tracking, walk/run/event run flow, countdown voice prompts, activity voice setting, stop/review/save flow, and the shareable RunNation activity card.
- `app/(tabs)/activity.tsx`: My Runs, club/community leaderboards, external activity submission, CSV export, and filters.
- `app/(tabs)/events.tsx`: Event discovery, registration status, event result display, and posters.
- `app/(tabs)/goals.tsx`: Personal goals, wellness summaries, medals, and leaderboard-related goal views.
- `app/(tabs)/chat.tsx`: Social feed, posts, comments, photos, and activity sharing.
- `app/(tabs)/shop.tsx`, `app/cart.tsx`, `app/checkout.tsx`: Shop catalogue, cart, checkout, and order flow.
- `app/profile.tsx`, `app/profleSetup.tsx`, `components/HeaderProfile.tsx`: Profile, onboarding/profile completion, photo upload, club membership.
- `app/settings.tsx`: Preferences, privacy, voice assistant, support, FAQ, feedback, account actions.
- `app/admin.tsx`: Admin dashboard for events, orders, stock, participants, uploads, roles, terms, requests, and magazine workflows.
- `app/(tabs)/magazine.tsx`, `app/magazine/*`, `components/magazine/*`: RunNation magazine features and submissions.

## Backend Areas

- `backend/trpc/app-router.ts`: Central route registration.
- `backend/trpc/routes/activities`: External activity approval, treadmill submission, event run completion, pending activity workflows.
- `backend/trpc/routes/admin`: Admin event, order, role, magazine, support, and account tools.
- `backend/trpc/routes/auth`: Auth registration, OAuth registration, login, and social email sync.
- `backend/trpc/routes/events`: Event registration and user registered event queries.
- `backend/trpc/routes/profile`: Profile bundle, update profile, photo upload, PIN verification.
- `backend/trpc/routes/social`: Social post/comment/reaction helpers.
- `backend/trpc/routes/support`: FAQ and support contact queries.
- `backend/trpc/rbac.ts`: Registration ownership and role-based access helpers.
- `backend/security.ts`, `backend/trpc/abuse.ts`: Security, validation, rate limiting, and abuse controls.

## Important Runtime Configuration

Root `.env` values used by the app:

- `EXPO_PUBLIC_API_URL`: Backend API URL used by the app, often a local Wi-Fi IP for device testing.
- `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Public Supabase anon key.

Backend `.env` values:

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only service role key. Never commit the real value.
- `CORS_ORIGINS`: Allowed app/web origins.
- `TRUST_PROXY`, `RATE_LIMIT_*`, `INPUT_MAX_STRING_LENGTH`: Backend security settings.

Use `.env.example` and `backend/.env.example` as templates. Real `.env` files are ignored by Git.

## Running Locally

Install dependencies:

```bash
bun install
```

Start the app tunnel:

```bash
bun run start
```

Start web preview:

```bash
bun run start-web
```

Run TypeScript verification:

```bash
npx tsc --noEmit
```

Run lint:

```bash
npm run lint
```

Current known lint state: lint has existing failures in `app/admin.tsx`, `app/cart.tsx`, and `app/subscription.tsx`. TypeScript currently passes.

## Exercise Recording Flow

The Exercise tab supports:

- GPS tracked Walk and Run.
- Event Run from registered events.
- Treadmill upload with image proof.
- Smart watch health metric import.
- Other Sports App import.

Current test-friendly thresholds:

- Minimum distance: `0.1 km`.
- Minimum activity duration: `3 minutes`.

When a GPS activity is started, the app shows a `3, 2, 1, START` countdown. If Activity Voice Assistant is enabled in Settings, the countdown is spoken. When a saved activity completes successfully, the app says: `Congratulations, activity completed`.

When the user presses Finish, GPS and timer stop, then a shareable RunNation activity screen opens. The user can:

- Save the activity and event result.
- Share a text summary.
- Close the screen.
- Select a light/dark card style.
- Add a background image.

The finished screen also has `Review / Save Activity` so a user can reopen the card if they closed it before saving.

## Data Model Notes

Common Supabase tables referenced by the app include:

- `registrations`: User registration profile fields.
- `profiles`: Auth-to-registration profile linkage.
- `contacts`: Email and phone contact data.
- `user_photos`: Profile photos stored in Supabase storage.
- `activities`: Approved/recorded activities.
- `external_activity_submissions`: Other source submissions awaiting approval.
- `events`, `event_enrollments`, `event_participant_results`: Event registration and result flow.
- `clubs`, `club_members`, `club_membership_request`: Club coordination and membership.
- `orders`, `cart`, shop/catalogue tables: Shop and checkout.
- `social_posts`, comments/reactions tables: Community feed.
- `roles`, `user_role_assignments`, admin audit tables: Admin/RBAC.

See `supabase/migrations` for schema history and `supabase/seeds/README.md` for seed data notes.

## Security And Privacy Notes

- Do not commit real `.env` or service role keys.
- Service-role Supabase work should stay in backend routes, never in app code.
- App public Supabase anon keys are expected client-side, but RLS and backend authorization still matter.
- `requireRegistrationOwner` and RBAC helpers protect sensitive backend routes.
- User profile photos and uploaded activity proof rely on Supabase storage policies and backend routes.

## Known Handoff Items

- Lint needs cleanup in existing files before enabling a strict GitHub CI lint gate.
- Some generated text in the old README had mojibake characters; this documentation is the cleaner handoff entry point.
- There are many unstaged and untracked changes in the current workspace. Review before making the first GitHub commit.
