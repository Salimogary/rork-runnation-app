# RunNation

RunNation is a cross-platform running community app built with Expo Router, React Native, Supabase, and tRPC. It supports workout tracking, event runs, recurring and multiday events, club and community reports, goals, chat, shop orders, magazine content, subscriptions, service-team roles, moderation, and admin workflows.

## Documentation

- [App documentation](docs/APP_DOCUMENTATION.md)
- [GitHub transfer checklist](docs/GITHUB_TRANSFER.md)
- [Admin and role terms index](docs/terms-and-conditions-index.md)

## Quick Start

Install dependencies:

```bash
bun install
```

Create local environment files from the examples:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Start the mobile app tunnel:

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

Current known state: TypeScript passes. Lint has existing failures in `app/admin.tsx`, `app/cart.tsx`, and `app/subscription.tsx`.

## Project Structure

```text
app/                 Expo Router screens
app/(tabs)/          Main tab screens: Workout, Reports, Events, Goals, Chat, Shop, Magazine
backend/             tRPC/Hono/Express backend code
components/          Shared UI components
constants/           Colors, countries, and app constants
contexts/            Auth, theme, subscription, notification contexts
docs/                Project and role documentation
lib/                 API, Supabase, server-client, and utility data modules
supabase/            Migrations, seeds, and database notes
utils/               Shared app helpers
```

## Environment

Root app environment:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_MAPS_ANDROID_API_KEY`

Backend environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS` comma-separated allowed origins; do not use `*`
- `TRUST_PROXY`
- `RATE_LIMIT_*`
- `INPUT_MAX_STRING_LENGTH`

Do not commit real `.env` files. Use the `.env.example` files as templates.

## Current Workout Recording Settings

For limited Wi-Fi range testing:

- Minimum saved GPS workout distance: `0.5 km`
- Minimum saved GPS workout time: `5 minutes`
- Shorter attempts can offer pause/resume instead of immediate save
- Paused time is stored on activities as cumulative paused seconds
- Start countdown: `3, 2, 1, START`
- Optional Activity Voice Assistant toggle in Settings
- Finish flow opens a RunNation share card with Save, Share, and Close options

Treadmill records count for workouts, reports, and goals, but not for event credit. Smart watch and other sports app imports can count for event credit after club or organizer approval with evidence where required.

## Release Readiness Notes

- Express backend uses CORS allow-listing, security headers, request sanitization, and general/sensitive rate limits.
- Sensitive write routes include registration/login, feedback, social posts/reports, service-role requests, family linking, magazine submissions, uploads, event/admin writes, and donation intents.
- The Running Post Gallery is image-only; accepted pictorials without a valid JPG/PNG/WEBP URL are not shown in the public Gallery.
- Workout recording uses foreground GPS plus Expo background location with an Android foreground-service notification so distance can continue while the screen is locked.
- Standalone Android builds that render `react-native-maps` must be built with `GOOGLE_MAPS_ANDROID_API_KEY`; Expo Go may not reveal a missing-key issue.
- Before a test APK, run `npx tsc --noEmit`, restart the backend after environment changes, restart Expo, and confirm Render has current `CORS_ORIGINS`.

## GitHub Handoff

Before pushing to GitHub, read [docs/GITHUB_TRANSFER.md](docs/GITHUB_TRANSFER.md). The workspace currently has many modified and untracked files, so stage intentionally and verify that secrets are not included.
