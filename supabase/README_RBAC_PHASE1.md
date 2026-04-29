# RBAC Phase 1

This folder holds the first database-only migration for moving RunNation toward a single-auth, role-based access model.

## What this phase adds

- `profiles`
- `roles`
- `user_role_assignments`
- `admin_action_logs`
- `admin_invites`
- helper SQL functions for role checks
- initial RLS policies on the new RBAC tables only

## Why this is adapted from the original RBAC prompt

The current app schema already has:

- `registrations.registration_id`
- `clubs.club_id uuid`
- `countries.iso_alpha2`

So this migration uses a compatibility bridge instead of forcing an immediate rewrite:

- `profiles.id` is the future `auth.users.id`
- `profiles.legacy_registration_id` links back to the current app user record
- country scoping uses `country_code` referencing `countries.iso_alpha2`
- club scoping uses the existing `clubs.club_id`

This keeps Phase 1 low-risk and avoids breaking the existing app while we prepare for unified Supabase Auth.

## Important note

This migration does **not** switch the app to Supabase Auth yet.

It only lays the foundation so later phases can:

1. resolve the signed-in auth user
2. fetch profile + roles
3. show admin/coordinator UI based on role assignments
4. retire separate admin and custom PIN auth over time

## Suggested next phase

Phase 2 should add a central role session layer in:

- `backend/trpc/create-context.ts`
- `contexts/AuthContext.tsx` or a new role/session context

No code in the app currently depends on these new tables yet.
