# RunNation Table Retention Review

This is based on the current `app/` and `backend/` code paths as of April 25, 2026.

## Keep

These tables are actively used by the current app or backend and should stay:

- `activities`
- `activity_uploads_admin_log`
- `admin_action_logs`
- `app_ratings`
- `catalogue`
- `club_members`
- `club_membership_request`
- `clubs`
- `contacts`
- `countries`
- `email_verification_codes`
- `event_enrollments`
- `events`
- `events_participants`
- `external_activity_submissions`
- `fitness_goal`
- `goals`
- `habit_declarations`
- `health_goal`
- `magazine_article_submissions`
- `magazine_categories`
- `magazine_issues`
- `magazine_articles`
- `magazine_article_images`
- `magazine_pictorial_submissions`
- `order_items`
- `orders`
- `orders_to_deliver`
- `pending_activities`
- `post_likes`
- `profiles`
- `registrations`
- `roles`
- `saved_articles`
- `article_views`
- `shopping_cart`
- `social_comment_reactions`
- `social_comments`
- `social_mentions`
- `social_poll_votes`
- `social_post_reactions`
- `social_posts`
- `subscriptions`
- `suggestions`
- `user_goals`
- `user_photos`
- `user_role_assignments`
- `weight_goal`
- `weight_target_goal`

## Delete Candidates

These are the best current candidates for retirement, but only after the related code is removed or migrated.

### `event_participants_snapshot`

Why it is a candidate:
- the participant-facing screen now reads from `events_participants` directly
- the remaining backend helper `get-snapshot-participants` looks legacy

Before deleting:
1. remove any admin tooling or SQL jobs that still refresh or depend on the snapshot
2. delete `backend/trpc/routes/admin/get-snapshot-participants.ts` if no longer needed

### `admin_users`

Why it is a candidate:
- this looks like legacy admin-password auth
- you already moved the main app toward Supabase Auth and said legacy login should be removed

Before deleting:
1. replace `request-password-reset` and `reset-password` with Supabase-auth-native admin flows
2. remove any frontend entry points that still rely on `admin_users`

## Keep But Review

These should stay, but they deserve a design/data review rather than automatic deletion:

### `club_membership_request`

Still used in several places, but it currently mixes:
- pending membership workflow
- approved club display data

Longer term, you may want:
- `club_membership_requests` for workflow history
- `club_members` for current membership only

### `registrations`

Still core to the app, but it is your legacy identity surface. Keep it for now because many features key off `registration_id`.

### `subscriptions`

Still active, but the payment state model should be reviewed once MTN MoMo or another production payment flow is finalized.

## Suggested Next DB Cleanup Sequence

1. Remove legacy code references to `event_participants_snapshot`
2. Remove legacy code references to `admin_users`
3. Split workflow/history tables from current-state tables where that reduces confusion
4. Re-run a fresh code scan before dropping anything
