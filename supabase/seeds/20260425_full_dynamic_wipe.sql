begin;

-- Use only on a disposable dev or staging database.
-- This removes mutable operational data so you can reseed the app from a clean state.

delete from public.activity_uploads_admin_log;
delete from public.admin_action_logs;
delete from public.email_verification_codes;
delete from public.social_mentions;
delete from public.social_comment_reactions;
delete from public.social_post_reactions;
delete from public.post_likes;
delete from public.social_poll_votes;
delete from public.social_comments;
delete from public.social_posts;
delete from public.order_items;
delete from public.orders;
delete from public.orders_to_deliver;
delete from public.shopping_cart;
delete from public.event_enrollments;
delete from public.events_participants;
delete from public.pending_activities;
delete from public.external_activity_submissions;
delete from public.activities;
delete from public.user_photos;
delete from public.subscriptions;
delete from public.habit_declarations;
delete from public.health_goal;
delete from public.weight_goal;
delete from public.weight_target_goal;
delete from public.fitness_goal;
delete from public.user_goals;
delete from public.club_membership_request;
delete from public.club_members;
delete from public.magazine_article_submissions;
delete from public.magazine_pictorial_submissions;
delete from public.saved_articles;
delete from public.article_views;
delete from public.suggestions;
delete from public.app_ratings;

-- Uncomment the next section only if you want to wipe master/demo data too.
-- delete from public.user_role_assignments;
-- delete from public.profiles;
-- delete from public.contacts;
-- delete from public.registrations;
-- delete from public.events;
-- delete from public.catalogue;
-- delete from public.clubs;

commit;
