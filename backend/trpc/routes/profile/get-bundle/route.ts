import { ADMIN_TERMS_VERSION } from "../../../admin-terms";
import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { requireRegistrationOwner } from "../../../rbac";

const DISTANCE_MILESTONES = [10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const ACTIVITY_INTERVAL = 10;
const MAX_ACTIVITY_BADGES = 100;

function getEarnedBadgeCount(totalDistanceKm: number, totalActivities: number): number {
  const distanceEarned = DISTANCE_MILESTONES.filter((km) => totalDistanceKm >= km).length;
  let activityEarned = 0;
  for (let i = ACTIVITY_INTERVAL; i <= MAX_ACTIVITY_BADGES; i += ACTIVITY_INTERVAL) {
    if (totalActivities >= i) activityEarned++;
    else break;
  }
  return distanceEarned + activityEarned;
}

export default publicProcedure
  .input(z.object({ registrationId: z.string().min(1) }))
  .query(async ({ input, ctx }) => {
    await requireRegistrationOwner(ctx, input.registrationId);

    let socialAuthVerified = false;
    if (ctx.authUserId) {
      const { data: authUserResult } = await ctx.supabase.auth.admin.getUserById(ctx.authUserId);
      const authUser = authUserResult?.user;
      const provider =
        authUser?.app_metadata?.provider ||
        authUser?.identities?.[0]?.provider ||
        null;

      socialAuthVerified = provider === "google" || provider === "apple";
    }

    const [
      regRes,
      contactRes,
      photoRes,
      activitiesRes,
      goalsRes,
      userGoalsRes,
      clubsRes,
      clubMembershipRes,
      subscriptionRes,
      fitnessGoalRes,
      weightTargetRes,
      enrollmentRes,
      profileRes,
    ] = await Promise.all([
      ctx.supabase.from("registrations").select("*").eq("registration_id", input.registrationId).maybeSingle(),
      ctx.supabase.from("contacts").select("email, country_code, phone, full_phone").eq("registration_id", input.registrationId).maybeSingle(),
      ctx.supabase.from("user_photos").select("file_path").eq("registration_id", input.registrationId).eq("is_profile_photo", true).maybeSingle(),
      ctx.supabase.from("activities").select("distance_km, exercise_type").eq("registration_id", input.registrationId),
      ctx.supabase.from("goals").select("goal_id, goal").order("goal_id", { ascending: true }),
      ctx.supabase.from("user_goals").select("*").eq("registration_id", input.registrationId),
      ctx.supabase.from("clubs").select("club_id, club_name, country, location, description, is_special_club, special_club_code, age_min, age_max").order("club_name", { ascending: true }),
      ctx.supabase.from("club_membership_request").select("*").eq("registration_id", input.registrationId).maybeSingle(),
      ctx.supabase.from("subscriptions").select("status, expires_at").eq("registration_id", input.registrationId).maybeSingle(),
      ctx.supabase.from("fitness_goal").select("fitness_goal_id").eq("registration_id", input.registrationId).limit(1),
      ctx.supabase.from("weight_target_goal").select("weight_target_goal_id").eq("registration_id", input.registrationId).limit(1),
      ctx.supabase.from("event_enrollments").select("event_enrollment_id").eq("registration_id", input.registrationId).limit(1),
      ctx.supabase.from("profiles").select("profile_id").eq("registration_id", input.registrationId).maybeSingle(),
    ]);

    if (regRes.error || !regRes.data) {
      throw new Error(regRes.error?.message || "No profile found for this user");
    }

    const profile = {
      ...regRes.data,
      email: contactRes.data?.email || regRes.data.email,
      country_code: contactRes.data?.country_code ?? null,
      phone:
        contactRes.data?.full_phone
          ? String(contactRes.data.full_phone)
          : contactRes.data?.phone
            ? String(contactRes.data.phone)
            : null,
      email_verified: regRes.data.email_verified === true || socialAuthVerified,
    };

    const validTypes = ["Run", "Walk", "Treadmill", "Tredmill"];
    const filteredActivities = (activitiesRes.data || []).filter((a: any) =>
      validTypes.includes(a.exercise_type || "")
    );
    const totalDistance = filteredActivities.reduce((sum: number, a: any) => sum + (a.distance_km || 0), 0);
    const totalActivities = filteredActivities.length;

    const p: any = regRes.data;
    const allFieldsFilled = !!(
      p &&
      p.first_name &&
      p.other_names &&
      p.username &&
      (contactRes.data?.email || p.email) &&
      p.sex &&
      p.city_town_district &&
      p.country &&
      p.dob
    );
    const hasProfilePhoto = !!photoRes.data?.file_path;
    const hasGoal = (userGoalsRes.data?.length ?? 0) > 0;
    const hasClub = !!(clubMembershipRes.data?.club && clubMembershipRes.data.club !== "");
    const hasFiveActivities = totalActivities >= 5;
    const hasAtLeastOneBadge = getEarnedBadgeCount(totalDistance, totalActivities) > 0;
    const sub = subscriptionRes.data;
    const hasSubscription = !!(
      sub &&
      sub.status === "active" &&
      (!sub.expires_at || new Date(sub.expires_at) > new Date())
    );
    const hasTargets = (fitnessGoalRes.data?.length ?? 0) > 0 || (weightTargetRes.data?.length ?? 0) > 0;
    const hasEventEnrollment = (enrollmentRes.data?.length ?? 0) > 0;
    const hasVerifiedEmail = p?.email_verified === true || socialAuthVerified;
    let requiresAdminTerms = false;
    let hasAcceptedAdminTerms = false;

    if (profileRes.data?.profile_id) {
      const [{ data: roleAssignments }, { data: termsAcceptance }] = await Promise.all([
        ctx.supabase
          .from("user_role_assignments")
          .select("assignment_id")
          .eq("user_id", profileRes.data.profile_id)
          .eq("is_active", true)
          .in("role_id", (
            await ctx.supabase
              .from("roles")
              .select("role_id")
              .in("role_name", ["super_admin", "country_admin", "country_coordinator", "club_coordinator"])
          ).data?.map((role: any) => role.role_id) ?? [-1]),
        ctx.supabase
          .from("admin_terms_acceptances")
          .select("acceptance_id")
          .eq("user_id", profileRes.data.profile_id)
          .eq("terms_version", ADMIN_TERMS_VERSION)
          .maybeSingle(),
      ]);

      requiresAdminTerms = (roleAssignments?.length ?? 0) > 0;
      hasAcceptedAdminTerms = !!termsAcceptance;
    }

    return {
      profile,
      profilePhoto: photoRes.data?.file_path || null,
      activityStats: { totalDistance, totalActivities },
      goals: goalsRes.data || [],
      userGoals: userGoalsRes.data || [],
      clubs: clubsRes.data || [],
      clubMembership: clubMembershipRes.data || null,
      completionInputs: {
        allFieldsFilled,
        hasProfilePhoto,
        hasGoal,
        hasClub,
        hasFiveActivities,
        hasSubscription,
        hasTargets,
        hasEventEnrollment,
        hasVerifiedEmail,
        hasAtLeastOneBadge,
        requiresAdminTerms,
        hasAcceptedAdminTerms,
      },
    };
  });
