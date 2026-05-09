# RunNation App Documentation

RunNation is an Expo Router and React Native app for runners, walkers, clubs, events, magazine content, shop orders, community chat, goals, reports, service-team roles, moderation, and admin operations. It uses Supabase for auth, data, storage, and migrations, with a TypeScript backend layer exposing tRPC routes.

## Core Stack

- App: Expo SDK 54, React Native 0.81, Expo Router, TypeScript.
- Server state: React Query and tRPC client.
- Backend: Hono/tRPC routes under `backend/trpc`, plus Express server files for standalone API hosting.
- Database and storage: Supabase, with migrations in `supabase/migrations`.
- UI: React Native components, Lucide icons, Expo image/location/speech/sharing modules.
- Package managers: Bun is used by the Rork scripts; `package-lock.json` is also present for npm-based installs.

## Main App Areas

- `app/(tabs)/index.tsx`: Workout screen. Handles GPS tracking, walk/run/event run flow, countdown voice prompts, activity voice setting, pause/resume, stop/review/save flow, and the shareable RunNation activity card.
- `app/(tabs)/activity.tsx`: Reports screen. Handles My Runs, My Club, Community reports, country flag/rank display, pace/time summaries, external activity submission, CSV export, and filters.
- `app/(tabs)/events.tsx`: Event discovery, local/all filters, same-day/recurring/multiday event groups, calendar view, registration status, event result display, and posters.
- `app/(tabs)/goals.tsx`: Personal goals, wellness summaries, weight-effectiveness tracking, daily running calendar goal, medals, and leaderboard-related goal views.
- `app/(tabs)/chat.tsx`: Social feed, posts, comments, photos, activity sharing, and report entry points for unsafe content.
- `app/(tabs)/shop.tsx`, `app/cart.tsx`, `app/checkout.tsx`: Shop catalogue, cart, checkout, and order flow.
- `app/profile.tsx`, `app/profleSetup.tsx`, `components/HeaderProfile.tsx`: Profile, onboarding/profile completion, photo upload, club membership, goals, and travel country/date range.
- `app/settings.tsx`: Preferences, distance unit setting, privacy, voice assistant, support, About RunNation, Join Service Team, FAQ, feedback, report feature, and account actions.
- `app/admin.tsx`: Admin dashboard for events, orders, stock, participants, uploads, roles, terms, chat reports, requests, and magazine workflows.
- `app/(tabs)/magazine.tsx`, `app/magazine/*`, `components/magazine/*`: The Running Post magazine, including News, Events, Community, Columns, Gallery, previews, and submissions.

## Backend Areas

- `backend/trpc/app-router.ts`: Central route registration.
- `backend/trpc/routes/activities`: External activity approval, treadmill submission, event run completion, pending activity workflows, screenshot/evidence handling, and event-credit rules.
- `backend/trpc/routes/admin`: Admin event, order, role, magazine, support, chat report, moderation, and account tools.
- `backend/trpc/routes/auth`: Auth registration, OAuth registration, login, and social email sync.
- `backend/trpc/routes/events`: Event registration and user registered event queries.
- `backend/trpc/routes/profile`: Profile bundle, update profile, photo upload, PIN verification.
- `backend/trpc/routes/service-team`: Join Service Team role availability and role request workflows.
- `backend/trpc/routes/social`: Social post/comment/reaction helpers and content reporting.
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

The app tab label is now `Workout`, but the core recording code still lives in `app/(tabs)/index.tsx`.

The Workout tab supports:

- GPS tracked Walk and Run.
- Event Run for same-day and recurring events.
- Record Workout for multiday events plus non-event activity.
- Treadmill upload with image proof.
- Smart watch import.
- Other Sports App import.

Current recording thresholds:

- Minimum GPS saved distance: `0.5 km`.
- Minimum GPS saved duration: `5 minutes`.
- If the workout is below the threshold, the user can pause and resume later where supported.
- Paused time is stored in `activities.pause_duration_seconds` and displayed on the activity result card.

When a GPS activity is started, the app shows a `3, 2, 1, START` countdown. If Activity Voice Assistant is enabled in Settings, the countdown is spoken. When a saved activity completes successfully, the app says: `Congratulations, activity completed`.

When the user presses Finish, GPS and timer stop, then a shareable RunNation activity screen opens. The user can:

- Save the activity and event result.
- Share a text summary.
- Close the screen.
- Select a light/dark card style.
- View paused time where available.

The finished screen also has `Review / Save Activity` so a user can reopen the card if they closed it before saving.

Workout source rules:

- Treadmill: counts for activities, reports, and goals, but does not count for events.
- Smart watch: can count for events after club or organizer approval. Screenshots/evidence support the approval process for event credit.
- Other sports app: can count for events after club or organizer approval. Screenshots/evidence support the approval process for event credit.
- Non-event smart watch or sports app imports should not be blocked just because no event screenshot is attached.

## Events

RunNation supports three event families:

- Same-day events: one event date. Event Run is active within the configured event date window.
- Recurring events: weekly or monthly events such as every Wednesday, selected day of month, or selected weekend of the month. Results are separated by occurrence date.
- Multiday events: date-range events where workouts inside the event period are recorded through normal Record Workout flow and counted automatically where eligible.

Event cards use compact metadata: short date or date range, country, and organizer on one line. Event discovery includes dropdown-style location and event-type filters plus a calendar view showing event names on dates.

Event result tables use compact columns:

- Same-day and recurring: flag/rank, name, club, sex, distance, time, pace.
- Multiday: flag/rank, name, club, sex, days, distance, time, pace.

Multiday results group by category, such as Marathon and Awaiting Result. Days show how many days the runner has participated. Green indicates the runner is current with the challenge; red indicates missed participation days. Multiday sorting prioritises days, average distance, then average pace.

Event completion rules:

- Events can optionally define minimum daily distance and/or minimum cumulative distance.
- Same-day and recurring events use minimum daily distance where enabled.
- Multiday events can use both minimum daily distance and minimum cumulative distance.
- Results are split into Finishers and Participants. Finishers have qualifying activity and meet event conditions; Participants are enrolled or awaiting qualifying results.
- Paid-event payment integration is not complete yet; the current button message is `payment link under maintenance`.

## Clubs, Special Clubs, And Travel

Normal clubs are country-scoped. During registration and profile editing, club lists should show clubs in the user's country, plus a final "My club is not on this list" option that encourages sharing RunNation with a club coordinator or creating the club profile from Settings > Join Service Team after registration.

Special clubs are global and not country-restricted:

- Junior Runners: ages 8 to 15 only.
- Golden Age Runners: ages 60 and above only.
- Treadmill Runners Club: optional, available broadly, and can support treadmill-data-focused club views.
- Para Runners Club: optional, for people with disabilities or physical impairments.

Profile travel settings allow a user to add a destination country and date range. During the travel period, event discovery can include both the profile country and the travel country.

## Service Team Roles

Settings > Join Service Team shows roles based on availability and the user's existing role status. If a user already has a role, the screen states the current role and country/scope instead of listing open roles.

Role order in the service team screen:

- Club Coordinator
- Country Coordinator
- Event Organizer
- Shop Manager

Additional global/special roles:

- Junior Runners Club Coordinator
- Golden Age Runners Club Coordinator
- Treadmill Runners Club Coordinator
- Para Runners Club Coordinator
- Magazine Columnist (Fitness Coach)
- Magazine Columnist (Sports Journalist)
- Magazine Columnist (Motivation Speaker)

Role rules:

- Most users can hold only one active admin/service role at a time.
- A basic user role can exist beside one active admin/service role.
- Super Admins are exempt where needed for setup and operations.
- Club coordinator requests use the `Create Club` action label.
- Event organizer and club creation requests are handled through Join Service Team instead of registration.
- Rejected role, club, organizer, event, magazine, or activity decisions remain visible to admins to prevent repeated action on the same rejected request.

## Magazine

The magazine is branded as `The Running Post`. It has five pages:

- News
- Events
- Community
- Columns
- Gallery

The simplified magazine model centres around a single article table shape: article id, registration id, page, author, date, title, body, picture link, and optional external link. Source workflows can still come from event organisers, community submissions, admin-sourced news, approved columnists, and gallery/pictorial submissions.

Editorial rules:

- Standard articles should usually be 150 to 250 words.
- Column articles should usually be 250 to 300 words.
- Event creation can include a magazine article and magazine photo.
- Magazine article upload is intentionally plain text for reliability across mobile/web.
- Admins can preview submissions before accepting or rejecting.
- Event-linked magazine content should be reviewed before the linked event is finally approved where that workflow applies.
- Gallery is image-led and prioritises portrait-friendly user camera photos.

## Chat Moderation And Reporting

Settings includes a report feature for abusive or unsafe chat/social content. Reports can include a screenshot and a brief description. Admins can review reported posts, remove offending content, and flag or ban repeat offenders.

Targeted abuse categories include abusive, hateful, disrespectful, divisive, sectarian, unpleasant, pornographic, threatening, illegal, misleading, or unsafe content.

Related backend infrastructure includes chat report routes, moderation flags, report review, and post/comment creation checks for banned users.

## About, FAQ, Terms, And Admin Rules

Settings includes:

- About RunNation with live Supabase community statistics.
- Help with country admin plus global admin contacts where available.
- Policy, Terms and Conditions.
- FAQ sourced from `public.faq_entries`.
- Suggestions, Rate Us, and Share App.

The support menu order is:

- About RunNation
- Join Service Team
- Help
- Policy, Terms and Conditions
- FAQ
- Suggestions
- Rate Us
- Share App

Admin terms are versioned through `ADMIN_TERMS_VERSION` in both backend and app helpers. The current version is `2026-05-09`, reflecting recent changes to recurring events, special clubs, magazine approval, imports, moderation, service-team roles, and one-role rules.

## Data Model Notes

Common Supabase tables referenced by the app include:

- `registrations`: User registration profile fields.
- `profiles`: Auth-to-registration profile linkage.
- `contacts`: Email and phone contact data.
- `user_photos`: Profile photos stored in Supabase storage.
- `activities`: Approved/recorded activities.
- `external_activity_submissions`: Other source submissions awaiting approval, including smart watch and sports app evidence where relevant.
- `events`, `event_enrollments`, `event_participant_results`: Event registration and result flow.
- `clubs`, `club_members`, `club_membership_request`: Club coordination and membership.
- `orders`, `cart`, shop/catalogue tables: Shop and checkout.
- `social_posts`, comments/reactions tables: Community feed.
- `roles`, `user_role_assignments`, admin audit tables: Admin/RBAC.
- `admin_invites`, `role_activities`: Service team role requests and role descriptions.
- `faq_entries`: Dynamic FAQ content shown in Settings.
- `magazine_article_submissions`, magazine/pictorial tables or live magazine article structures: Editorial review and published magazine content.
- Chat report and moderation tables: Social safety reports, review decisions, and user flags/bans.

See `supabase/migrations` for schema history and `supabase/seeds/README.md` for seed data notes.

## Security And Privacy Notes

- Do not commit real `.env` or service role keys.
- Service-role Supabase work should stay in backend routes, never in app code.
- App public Supabase anon keys are expected client-side, but RLS and backend authorization still matter.
- `requireRegistrationOwner` and RBAC helpers protect sensitive backend routes.
- User profile photos and uploaded activity proof rely on Supabase storage policies and backend routes.
- Chat report screenshots, event import screenshots, magazine photos, pictorials, and profile photos require storage policies or backend upload routes appropriate to their use.
- RLS policies should allow ordinary users to create their own submissions/reports while allowing scoped admins to review only the data they are permitted to manage.

## Known Handoff Items

- Lint needs cleanup in existing files before enabling a strict GitHub CI lint gate.
- Some generated text in the old README had mojibake characters; this documentation is the cleaner handoff entry point.
- There are many unstaged and untracked changes in the current workspace. Review before making the first GitHub commit.
- Run all new Supabase migrations in order before testing FAQ, special clubs, recurring events, moderation reports, and updated admin terms in a deployed environment.
