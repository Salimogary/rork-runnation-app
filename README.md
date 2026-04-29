# RunNation

RunNation is a cross-platform running community app built with Expo Router, React Native, Supabase, and tRPC. It supports activity tracking, event runs, club and community leaderboards, goals, chat, shop orders, magazine content, subscriptions, and admin workflows.

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
app/(tabs)/          Main tab screens: Exercise, Activity, Events, Goals, Chat, Shop, Magazine
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

Backend environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS`
- `TRUST_PROXY`
- `RATE_LIMIT_*`
- `INPUT_MAX_STRING_LENGTH`

Do not commit real `.env` files. Use the `.env.example` files as templates.

## Current Exercise Testing Settings

For limited Wi-Fi range testing:

- Minimum saved activity distance: `0.1 km`
- Minimum saved activity time: `3 minutes`
- Start countdown: `3, 2, 1, START`
- Optional Activity Voice Assistant toggle in Settings
- Finish flow opens a RunNation share card with Save, Share, and Close options

## GitHub Handoff

Before pushing to GitHub, read [docs/GITHUB_TRANSFER.md](docs/GITHUB_TRANSFER.md). The workspace currently has many modified and untracked files, so stage intentionally and verify that secrets are not included.
